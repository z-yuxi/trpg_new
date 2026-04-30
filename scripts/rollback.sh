#!/usr/bin/env bash
# =============================================================================
# rollback.sh — 回滚执行脚本（可执行 SOP）
#
# 用法：
#   bash scripts/rollback.sh <git-commit-sha> [--db-rollback]
#
# 参数：
#   <git-commit-sha>  回滚到的目标提交 SHA（必填）
#   --db-rollback     同时执行数据库迁移回滚（可选，有数据风险，需确认）
#
# 触发条件（满足任一即回滚）：
#   - 线上 5xx 错误率 > 1%（5 分钟窗口）
#   - P99 响应时间 > 3s（连续 3 分钟）
#   - 关键业务指标：grant_failed > 5 次/分钟
#   - 主动判断：功能异常但未触发上述阈值
#
# 预期执行时间：< 3 分钟
# =============================================================================
set -euo pipefail

TARGET_SHA="${1:-}"
DB_ROLLBACK=false
for arg in "$@"; do
  [[ "$arg" == "--db-rollback" ]] && DB_ROLLBACK=true
done

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"

ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; exit 1; }
info() { echo -e "${YELLOW}  → $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }

if [[ -z "$TARGET_SHA" ]]; then
  echo -e "${RED}用法: bash scripts/rollback.sh <git-commit-sha> [--db-rollback]${NC}"
  exit 1
fi

echo ""
echo "========================================================"
echo "  TRPG Platform — 回滚执行脚本"
echo "  目标版本: $TARGET_SHA"
echo "========================================================"
echo ""

# ── 0. 记录回滚开始时间（审计用）─────────────────────────────────────────────
ROLLBACK_START=$(date +%Y%m%d_%H%M%S)
ROLLBACK_LOG="rollback_${ROLLBACK_START}.log"
info "回滚日志将写入: $ROLLBACK_LOG"
exec > >(tee -a "$ROLLBACK_LOG") 2>&1

# ── 1. 确认操作（防止误触发）──────────────────────────────────────────────────
warn "即将执行回滚！目标 SHA: $TARGET_SHA"
if [[ "$DB_ROLLBACK" == "true" ]]; then
  warn "同时执行数据库回滚（--db-rollback）"
fi
echo ""
read -p "确认回滚？输入 YES 继续: " CONFIRM
[[ "$CONFIRM" != "YES" ]] && { echo "已取消"; exit 0; }

# ── 2. 拉取目标版本代码 ────────────────────────────────────────────────────────
info "Step 1/4: 检出目标提交"
if git fetch origin && git checkout "$TARGET_SHA" -- packages/server packages/shared; then
  ok "代码已检出到 $TARGET_SHA"
else
  fail "代码检出失败，请检查 SHA 是否正确"
fi

# ── 3. 重建并重启服务 ──────────────────────────────────────────────────────────
info "Step 2/4: 重新构建服务镜像"
if docker compose build server; then
  ok "镜像构建完成"
else
  fail "镜像构建失败，请检查 Dockerfile"
fi

info "Step 3/4: 重启服务（零停机）"
if docker compose up -d --no-deps --scale server=2 server; then
  # 等待新实例健康
  sleep 5
  if curl -sf http://localhost:3000/api/health > /dev/null; then
    docker compose up -d --no-deps --scale server=1 server
    ok "服务已回滚并重启"
  else
    fail "新实例健康检查失败，请手动干预"
  fi
else
  fail "服务重启失败"
fi

# ── 4. 数据库迁移回滚（可选）──────────────────────────────────────────────────
if [[ "$DB_ROLLBACK" == "true" ]]; then
  info "Step 4/4: 数据库迁移回滚（高风险，执行中...）"
  warn "回滚数据库可能导致数据丢失，操作不可逆！"
  read -p "再次确认数据库回滚？输入 DB_ROLLBACK 继续: " DB_CONFIRM
  if [[ "$DB_CONFIRM" == "DB_ROLLBACK" ]]; then
    if pnpm --filter @trpg/server run migrate -- rollback; then
      ok "数据库迁移已回滚"
    else
      fail "数据库迁移回滚失败，请联系 DBA"
    fi
  else
    warn "已跳过数据库回滚"
  fi
else
  ok "Step 4/4: 跳过数据库回滚（如需回滚数据库，用 --db-rollback）"
fi

# ── 5. 回滚后验证 ─────────────────────────────────────────────────────────────
info "验证回滚结果..."
HEALTH=$(curl -sf http://localhost:3000/api/health 2>/dev/null || echo "FAIL")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "健康检查通过: $HEALTH"
else
  warn "健康检查返回非 ok，请手动确认: $HEALTH"
fi

echo ""
echo -e "${GREEN}========================================================"
echo "  回滚完成！执行时间: $ROLLBACK_START → $(date +%H:%M:%S)"
echo "  日志已保存到: $ROLLBACK_LOG"
echo -e "========================================================${NC}"
echo ""
echo "后续操作："
echo "  1. 立即通知 QA 进行关键路径验证"
echo "  2. 在 Slack #incidents 发布回滚通知"
echo "  3. 复盘：排查上线失败原因并补测试覆盖"
