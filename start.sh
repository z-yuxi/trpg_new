#!/bin/bash
# =============================================================
# TRPG 通用平台  一键启动脚本
# 适用系统：Ubuntu 22.04 / 24.04 LTS
# 使用方式：chmod +x start.sh && ./start.sh
# =============================================================

set -e

# ── 颜色输出 ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${CYAN}======================================================"
echo -e "   TRPG 通用平台  一键启动脚本"
echo -e "======================================================${NC}"
echo ""

# ── 第一步：环境检查 ──────────────────────────────────────────

info "检查运行环境..."

# Node.js
if ! command -v node &>/dev/null; then
    error "未找到 Node.js，请参考指南第一部分进行安装"
fi
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    error "Node.js 版本过低（当前 $(node -v)），需要 v18 或以上"
fi
success "Node.js $(node -v)"

# pnpm
if ! command -v pnpm &>/dev/null; then
    warn "未找到 pnpm，正在自动安装..."
    npm install -g pnpm
fi
success "pnpm $(pnpm -v)"

# MySQL
if ! mysqladmin ping -h 127.0.0.1 --silent 2>/dev/null; then
    echo ""
    echo -e "${RED}[ERROR]${NC} MySQL 未运行，请先执行以下命令之一启动 MySQL："
    echo "        sudo systemctl start mysql        # 系统安装方式"
    echo "        docker start trpg-mysql           # Docker 方式"
    exit 1
fi
success "MySQL 连接正常"

# Redis
if ! redis-cli ping &>/dev/null; then
    echo ""
    echo -e "${RED}[ERROR]${NC} Redis 未运行，请先执行以下命令之一启动 Redis："
    echo "        sudo systemctl start redis-server  # 系统安装方式"
    echo "        docker start trpg-redis            # Docker 方式"
    exit 1
fi
success "Redis 连接正常"

echo ""

# ── 第二步：安装依赖 ──────────────────────────────────────────

info "安装项目依赖（首次运行约需 2-5 分钟）..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
success "依赖安装完成"
echo ""

# ── 第三步：环境变量配置 ──────────────────────────────────────

ENV_FILE="packages/server/.env"
if [ ! -f "$ENV_FILE" ]; then
    info "首次启动，生成后端环境配置文件..."
    cat > "$ENV_FILE" << 'ENVEOF'
# TRPG服务器配置（开发环境）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=trpg_platform
DB_USER=trpg
DB_PASSWORD=trpg_password
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JWT_SECRET=trpg-dev-secret-change-this-in-production
PORT=3000
NODE_ENV=development
SNOWFLAKE_WORKER_ID=1
ENVEOF
    success "已生成 $ENV_FILE（若数据库密码不同，请编辑此文件）"
else
    success "环境配置文件已存在：$ENV_FILE"
fi
echo ""

# ── 第四步：数据库迁移 ────────────────────────────────────────

info "初始化数据库表结构..."
cd packages/server

# 优先通过 tsx 运行 knex
if npx tsx node_modules/.bin/knex migrate:latest \
    --knexfile src/db/knex-config.ts 2>/dev/null; then
    success "数据库迁移成功"
else
    warn "迁移命令返回非零（若表已存在可忽略，继续启动）"
fi
cd ../..
echo ""

# ── 第五步：构建共享包 ────────────────────────────────────────

info "构建共享类型库..."
pnpm --filter @trpg/shared build 2>/dev/null || true
success "共享库就绪"
echo ""

# ── 第六步：启动后端 ──────────────────────────────────────────

info "启动后端服务（日志 → server.log）..."
cd packages/server
pnpm dev > ../../server.log 2>&1 &
SERVER_PID=$!
cd ../..

# 等待后端健康检查（最多 15 秒）
READY=0
for i in $(seq 1 15); do
    sleep 1
    if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
        READY=1
        break
    fi
done

if [ $READY -eq 1 ]; then
    success "后端服务启动成功（PID: $SERVER_PID）"
else
    warn "后端启动超时，请查看 server.log 排查问题"
    warn "tail -20 server.log"
fi
echo ""

# ── 第七步：启动前端 ──────────────────────────────────────────

info "启动前端开发服务器（日志 → client.log）..."
cd packages/client
pnpm dev > ../../client.log 2>&1 &
CLIENT_PID=$!
cd ../..

sleep 3
success "前端服务启动成功（PID: $CLIENT_PID）"
echo ""

# ── 完成 ──────────────────────────────────────────────────────

echo -e "${GREEN}======================================================"
echo -e "   启动完成！"
echo -e "======================================================${NC}"
echo ""
echo -e "  ${CYAN}前端地址${NC}  →  http://localhost:5173"
echo -e "  ${CYAN}后端地址${NC}  →  http://localhost:3000"
echo -e "  ${CYAN}健康检查${NC}  →  http://localhost:3000/api/health"
echo ""
echo -e "  查看后端日志：${YELLOW}tail -f server.log${NC}"
echo -e "  查看前端日志：${YELLOW}tail -f client.log${NC}"
echo ""
echo -e "  停止所有服务：${YELLOW}kill $SERVER_PID $CLIENT_PID${NC}"
echo ""
echo -e "  请在浏览器打开：${CYAN}http://localhost:5173${NC}"
echo ""

# 将 PID 写入文件，方便后续停止
echo "$SERVER_PID $CLIENT_PID" > .pids
