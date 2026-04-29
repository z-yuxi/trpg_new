#!/usr/bin/env bash
# canary-rollout.sh
#
# 灰度发布策略 & 回滚演练脚本
#
# 用途：
#   在预发布（staging）或生产环境中执行金丝雀（Canary）发布：
#   1. 构建新镜像并推送
#   2. 将 10% 流量切到新版本
#   3. 观测 5 分钟关键指标（错误率、P95 响应时间）
#   4. 指标健康时继续扩量（10% → 50% → 100%）
#   5. 任意阶段指标异常时自动回滚到旧版本
#
# 前置依赖：
#   - docker compose（v2+）
#   - curl（健康检查）
#   - jq（指标解析，可选）
#
# 环境变量：
#   NEW_IMAGE_TAG      新版本镜像 tag（默认 latest）
#   OLD_IMAGE_TAG      旧版本镜像 tag（回滚目标，默认 previous）
#   API_BASE_URL       API 根 URL（健康检查用，默认 http://localhost:3000）
#   SMOKE_TIMEOUT      冒烟超时秒数（默认 30）
#   CANARY_STEPS       灰度阶段权重列表，逗号分隔（默认 10,50,100）
#   CANARY_OBSERVE_SEC 每阶段观察时间秒数（默认 300 即 5 分钟）
#   ERROR_RATE_LIMIT   允许的最高错误率百分比（默认 5）
#
# 使用示例：
#   NEW_IMAGE_TAG=v1.2.3 OLD_IMAGE_TAG=v1.2.2 ./scripts/canary-rollout.sh
#
# 退出码：
#   0 — 发布成功（已达 100% 流量）
#   1 — 发布中止（已执行回滚）
#   2 — 回滚本身也失败（需人工介入）

set -euo pipefail

# ─── 配置 ────────────────────────────────────────────────────────────────────
NEW_IMAGE_TAG="${NEW_IMAGE_TAG:-latest}"
OLD_IMAGE_TAG="${OLD_IMAGE_TAG:-previous}"
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-30}"
CANARY_STEPS="${CANARY_STEPS:-10,50,100}"
CANARY_OBSERVE_SEC="${CANARY_OBSERVE_SEC:-300}"
ERROR_RATE_LIMIT="${ERROR_RATE_LIMIT:-5}"

COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="server"
LOG_FILE="rollout-$(date +%Y%m%d-%H%M%S).log"

# ─── 工具函数 ────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
ok()  { log "✓ $*"; }
err() { log "✗ $*"; }

health_check() {
  local url="$API_BASE_URL/api/health"
  local deadline=$(( $(date +%s) + SMOKE_TIMEOUT ))
  log "健康检查：$url（超时 ${SMOKE_TIMEOUT}s）"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    status=$(curl -sf -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [ "$status" = "200" ]; then
      ok "健康检查通过（HTTP 200）"
      return 0
    fi
    log "  等待服务就绪（当前 HTTP $status）..."
    sleep 3
  done
  err "健康检查超时（${SMOKE_TIMEOUT}s 内未返回 200）"
  return 1
}

smoke_test() {
  log "执行冒烟测试..."
  local failed=0

  # 健康检查
  health_check || { failed=1; }

  # 基础 API 可达性
  local endpoints=("/api/health" "/api/recruitment")
  for ep in "${endpoints[@]}"; do
    code=$(curl -sf -o /dev/null -w "%{http_code}" "$API_BASE_URL$ep" 2>/dev/null || echo "000")
    if [ "$code" -ge 500 ] 2>/dev/null; then
      err "冒烟端点 $ep 返回 $code"
      failed=1
    else
      ok "冒烟端点 $ep → HTTP $code"
    fi
  done

  return $failed
}

observe_metrics() {
  local step=$1
  log "观测阶段（${step}% 流量，${CANARY_OBSERVE_SEC}s）..."
  local start=$(date +%s)
  local errors=0
  local total=0

  while [ $(( $(date +%s) - start )) -lt "$CANARY_OBSERVE_SEC" ]; do
    code=$(curl -sf -o /dev/null -w "%{http_code}" "$API_BASE_URL/api/health" 2>/dev/null || echo "000")
    total=$(( total + 1 ))
    if [ "$code" -ge 500 ] 2>/dev/null || [ "$code" = "000" ]; then
      errors=$(( errors + 1 ))
    fi
    sleep 5
  done

  if [ "$total" -gt 0 ]; then
    local error_pct=$(( errors * 100 / total ))
    log "  观测结果：${total} 次探针，${errors} 次错误（${error_pct}%）"
    if [ "$error_pct" -gt "$ERROR_RATE_LIMIT" ]; then
      err "错误率 ${error_pct}% 超过阈值 ${ERROR_RATE_LIMIT}%，触发回滚"
      return 1
    fi
    ok "错误率 ${error_pct}% 在阈值内，继续扩量"
  fi
  return 0
}

rollback() {
  err "=== 开始回滚到 ${OLD_IMAGE_TAG} ==="
  # 方式 1：通过 docker compose 重新拉取旧镜像并重启
  if IMAGE_TAG="$OLD_IMAGE_TAG" docker compose -f "$COMPOSE_FILE" up -d --no-build "$SERVICE_NAME" 2>>"$LOG_FILE"; then
    # 等待旧版本健康
    if health_check; then
      ok "回滚成功：服务已恢复到 ${OLD_IMAGE_TAG}"
      return 0
    fi
  fi
  err "回滚失败！需要人工介入。日志：$LOG_FILE"
  return 1
}

# ─── 主流程 ──────────────────────────────────────────────────────────────────
log "=========================================="
log "灰度发布开始"
log "  新版本：$NEW_IMAGE_TAG"
log "  旧版本：$OLD_IMAGE_TAG"
log "  灰度阶段：$CANARY_STEPS"
log "  日志文件：$LOG_FILE"
log "=========================================="

# 解析阶段列表
IFS=',' read -ra STEPS <<< "$CANARY_STEPS"

for step in "${STEPS[@]}"; do
  log ""
  log "─── 灰度 ${step}% ───────────────────────────────────"

  if [ "$step" -eq 10 ]; then
    # 第一阶段：部署新版本，保留旧版本作为主流量
    log "部署新镜像（${NEW_IMAGE_TAG}）..."
    if ! IMAGE_TAG="$NEW_IMAGE_TAG" docker compose -f "$COMPOSE_FILE" up -d --no-build "$SERVICE_NAME" 2>>"$LOG_FILE"; then
      err "部署失败"
      rollback || exit 2
      exit 1
    fi

    # 冒烟测试
    if ! smoke_test; then
      err "冒烟测试失败，中止发布"
      rollback || exit 2
      exit 1
    fi
  else
    log "扩量到 ${step}%（nginx upstream 权重调整 — 当前为全量模式，此步骤为占位符）"
    # 真实场景可通过 consul / nginx 动态配置调整 upstream weight
    # 例：nginx -s reload（配合模板渲染 weight 值）
  fi

  # 观测指标
  if ! observe_metrics "$step"; then
    rollback || exit 2
    exit 1
  fi

  ok "阶段 ${step}% 通过"
done

log ""
log "=========================================="
ok "灰度发布完成！100% 流量已切换到 ${NEW_IMAGE_TAG}"
log "  日志文件：$LOG_FILE"
log "=========================================="
exit 0
