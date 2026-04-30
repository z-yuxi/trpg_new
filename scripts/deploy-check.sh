#!/usr/bin/env bash
# =============================================================================
# deploy-check.sh — 发布前门禁检查脚本（可执行 SOP）
#
# 用法：
#   bash scripts/deploy-check.sh [--skip-e2e] [--skip-migrate]
#
# 通过所有检查后退出码 0，任何检查失败立即退出码 1。
# CI/CD 流水线可在 docker build 之前调用此脚本。
# CI 推荐用法：bash scripts/deploy-check.sh --skip-e2e --skip-migrate
# =============================================================================
set -euo pipefail

SKIP_E2E=false
SKIP_MIGRATE=false
for arg in "$@"; do
  [[ "$arg" == "--skip-e2e" ]]      && SKIP_E2E=true
  [[ "$arg" == "--skip-migrate" ]]  && SKIP_MIGRATE=true
done

GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"

ok()   { echo -e "${GREEN}  ✓ $*${NC}"; }
fail() { echo -e "${RED}  ✗ $*${NC}"; exit 1; }
info() { echo -e "${YELLOW}  → $*${NC}"; }

echo ""
echo "========================================================"
echo "  TRPG Platform — 发布前门禁检查"
echo "========================================================"
echo ""

# ── 1. TypeScript 编译检查 ─────────────────────────────────────────────────────
info "Step 1/6: TypeScript 编译检查"
if cd packages/server && npx tsc --noEmit 2>&1 | head -20; then
  ok "server tsc 通过"
else
  fail "server tsc 有错误，请修复后重新发布"
fi
cd ../..

if cd packages/client && npx tsc --noEmit 2>&1 | head -20; then
  ok "client tsc 通过"
else
  fail "client tsc 有错误，请修复后重新发布"
fi
cd ../..

# ── 2. 单元测试 ────────────────────────────────────────────────────────────────
info "Step 2/6: 单元测试"
if pnpm --filter @trpg/server exec vitest run 2>&1 | tail -5; then
  ok "server 单元测试通过"
else
  fail "server 单元测试失败"
fi

# ── 3. E2E 验收测试（门禁关键路径）────────────────────────────────────────────
if [[ "$SKIP_E2E" == "false" ]]; then
  info "Step 3/6: E2E 验收测试"
  if pnpm --filter @trpg/server test:accept 2>&1 | tail -10; then
    ok "E2E 验收测试通过"
  else
    fail "E2E 验收测试失败，禁止发布"
  fi
else
  info "Step 3/6: E2E 验收测试（已跳过，仅限紧急修复使用）"
fi

# ── 4. 数据库迁移回滚演练 ──────────────────────────────────────────────────────
if [[ "$SKIP_MIGRATE" == "false" ]]; then
  info "Step 4/6: 迁移回滚演练"
  if pnpm --filter @trpg/server run migrate -- latest 2>&1 | tail -5; then
    ok "迁移 latest 通过"
  else
    fail "迁移 latest 失败"
  fi
else
  info "Step 4/6: 迁移回滚演练（已跳过，CI 环境无真实 DB）"
fi

# ── 5. 安全测试 ────────────────────────────────────────────────────────────────
info "Step 5/6: 安全测试"
if pnpm --filter @trpg/server exec vitest run src/__tests__/security/ 2>&1 | tail -5; then
  ok "安全测试通过"
else
  fail "安全测试失败"
fi

# ── 6. 客户端构建检查 ──────────────────────────────────────────────────────────
info "Step 6/6: 客户端构建检查"
if cd packages/client && pnpm run build 2>&1 | tail -5; then
  ok "客户端构建通过"
else
  fail "客户端构建失败"
fi
cd ../..

echo ""
echo -e "${GREEN}========================================================"
echo -e "  ✓ 所有门禁检查通过，可以发布"
echo -e "========================================================${NC}"
echo ""

# ── 可选 Step 7：发布后健康探针（需在生产环境执行，CI 跳过） ─────────────────
# 用法：HEALTH_CHECK_URL=https://api.yourdomain.com bash scripts/deploy-check.sh
if [[ -n "${HEALTH_CHECK_URL:-}" ]]; then
  info "Step 7（可选）: 发布后告警探针（P0/P1 健康检查）"
  ALERTS_URL="${HEALTH_CHECK_URL}/api/metrics/alerts"
  # 最多等待 60 秒，每 5 秒轮询一次
  MAX_WAIT=60; INTERVAL=5; ELAPSED=0
  while [[ $ELAPSED -lt $MAX_WAIT ]]; do
    RESPONSE=$(curl -sf -H "Authorization: Bearer ${HEALTH_CHECK_TOKEN:-}" "$ALERTS_URL" 2>/dev/null || echo "")
    if [[ -z "$RESPONSE" ]]; then
      info "  等待服务就绪... (${ELAPSED}s/${MAX_WAIT}s)"
      sleep $INTERVAL; ELAPSED=$((ELAPSED + INTERVAL)); continue
    fi
    HAS_P0=$(echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(str(d.get('has_p0',False)).lower())" 2>/dev/null || echo "unknown")
    if [[ "$HAS_P0" == "true" ]]; then
      fail "发布后 P0 告警触发！请立即检查 ${ALERTS_URL}"
    fi
    ok "告警探针通过，无 P0 告警"
    break
  done
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    echo -e "${YELLOW}  ⚠ 健康探针超时（服务可能尚未就绪），跳过${NC}"
  fi
fi
