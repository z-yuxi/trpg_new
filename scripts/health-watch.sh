#!/usr/bin/env bash
# =============================================================================
# health-watch.sh — 发布观测窗口自动巡检脚本
#
# 用法（发布后立即启动，持续 30 分钟）：
#   bash scripts/health-watch.sh [--duration=1800] [--interval=30]
#
# 功能：
#   - 每 30 秒采样一次健康检查 + 业务指标
#   - 若命中回滚阈值，打印告警并退出码 2（由 CI 触发自动回滚）
#
# 回滚阈值（可通过环境变量覆盖）：
#   ALERT_5XX_RATE=1      5xx 错误率 > 1% 触发（5分钟窗口 grant_failed/payment_callback）
#   ALERT_GRANT_FAIL=5    grant_failed 5分钟窗口 > 5 次触发
#   ALERT_HEALTH_FAIL=3   连续 N 次健康检查失败触发
# =============================================================================
set -uo pipefail

DURATION=${DURATION:-1800}       # 观测时长（秒），默认 30 分钟
INTERVAL=${INTERVAL:-30}         # 采样间隔（秒）
ALERT_5XX_RATE=${ALERT_5XX_RATE:-1}
ALERT_GRANT_FAIL=${ALERT_GRANT_FAIL:-5}
ALERT_HEALTH_FAIL=${ALERT_HEALTH_FAIL:-3}

# 从命令行参数解析（--key=value 格式）
for arg in "$@"; do
  [[ "$arg" =~ ^--duration=([0-9]+)$ ]] && DURATION="${BASH_REMATCH[1]}"
  [[ "$arg" =~ ^--interval=([0-9]+)$ ]] && INTERVAL="${BASH_REMATCH[1]}"
done

API_BASE="${API_BASE:-http://localhost:3000/api}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"

ok()   { echo -e "[$(date +%H:%M:%S)] ${GREEN}OK   $*${NC}"; }
alert(){ echo -e "[$(date +%H:%M:%S)] ${RED}ALERT $*${NC}"; }
info() { echo -e "[$(date +%H:%M:%S)] ${YELLOW}INFO  $*${NC}"; }

HEALTH_FAIL_COUNT=0
START_TIME=$(date +%s)
SAMPLE_COUNT=0

info "开始发布观测，时长 ${DURATION}s，采样间隔 ${INTERVAL}s"
echo ""

while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TIME))
  [[ $ELAPSED -ge $DURATION ]] && { ok "观测窗口结束，未触发回滚阈值 ✓"; exit 0; }

  SAMPLE_COUNT=$((SAMPLE_COUNT + 1))

  # ── 健康检查 ──────────────────────────────────────────────────────────────
  HEALTH_RESP=$(curl -sf --max-time 5 "${API_BASE}/health" 2>/dev/null || echo "FAIL")
  if [[ "$HEALTH_RESP" == "FAIL" ]] || ! echo "$HEALTH_RESP" | grep -q '"status"'; then
    HEALTH_FAIL_COUNT=$((HEALTH_FAIL_COUNT + 1))
    alert "健康检查失败 (${HEALTH_FAIL_COUNT}/${ALERT_HEALTH_FAIL})"
    if [[ $HEALTH_FAIL_COUNT -ge $ALERT_HEALTH_FAIL ]]; then
      alert "触发回滚阈值：连续 ${ALERT_HEALTH_FAIL} 次健康检查失败！"
      exit 2
    fi
  else
    HEALTH_FAIL_COUNT=0
    DB_STATUS=$(echo "$HEALTH_RESP" | grep -o '"db":"[^"]*"' | cut -d'"' -f4)
    REDIS_STATUS=$(echo "$HEALTH_RESP" | grep -o '"redis":"[^"]*"' | cut -d'"' -f4)
    ok "Health: db=$DB_STATUS redis=$REDIS_STATUS (${ELAPSED}s/${DURATION}s)"
  fi

  # ── 业务指标检查（需要 admin token）─────────────────────────────────────
  if [[ -n "$ADMIN_TOKEN" ]]; then
    METRICS_RESP=$(curl -sf --max-time 5 \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      "${API_BASE}/metrics/business" 2>/dev/null || echo "")

    if [[ -n "$METRICS_RESP" ]]; then
      GRANT_FAILED=$(echo "$METRICS_RESP" | grep -o '"grant_failed":[0-9]*' | cut -d: -f2 || echo 0)
      PAYMENT_CB=$(echo "$METRICS_RESP"   | grep -o '"payment_callback":[0-9]*' | cut -d: -f2 || echo 0)

      GRANT_FAILED=${GRANT_FAILED:-0}
      PAYMENT_CB=${PAYMENT_CB:-0}

      info "Metrics(5m): payment_callback=${PAYMENT_CB} grant_failed=${GRANT_FAILED}"

      # 检查 grant_failed 5分钟窗口阈值
      if [[ $GRANT_FAILED -gt $ALERT_GRANT_FAIL ]]; then
        alert "触发回滚阈值：grant_failed=${GRANT_FAILED} > ${ALERT_GRANT_FAIL}！"
        exit 2
      fi
    fi
  fi

  sleep "$INTERVAL"
done
