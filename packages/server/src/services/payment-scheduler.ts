/**
 * PaymentScheduler — 支付对账 & 告警周期任务
 *
 * 职责：
 *   1. 对账扫描（每 10 分钟）：
 *      - 查询超过 PAYMENT_RECONCILE_TIMEOUT_MS（默认 15min）仍处于 pending 的订单
 *      - 写 payment_audit_log event_type=reconcile_timeout 便于人工核查
 *      - 超时订单数 ≥ 1 → 触发 reconcile_pending_timeout 指标，进而触发 P1 告警
 *      - 预留 queryPaymentProvider(order) stub：接入真实渠道查单 API 后可自动补单
 *   2. 业务告警评估（每 2 分钟）：
 *      - 读取 metrics 快照，交由 AlertManager 评估 P0/P1 规则
 *      - AlertManager 负责去重冷却、console 输出、HTTP webhook 通知
 *
 * 注意：
 *   - 本模块仅提供 start() / stop() 接口，由 server.ts 在启动时调用
 *   - 不依赖 node-cron，使用 setInterval 避免多余依赖
 *
 * 环境变量：
 *   PAYMENT_RECONCILE_TIMEOUT_MS  — 订单挂起判定超时（默认 900_000 = 15min）
 *   PAYMENT_RECONCILE_INTERVAL_MS — 对账扫描间隔（默认 600_000 = 10min）
 *   ALERT_EVAL_INTERVAL_MS        — 告警评估间隔（默认 120_000 = 2min）
 */

import { db } from '../db';
import { generateId } from '@trpg/shared';
import { metrics } from '../utils/business-metrics';
import { alertManager } from '../utils/alert-manager';

// ── 配置 ──────────────────────────────────────────────────────────────────────

const RECONCILE_TIMEOUT_MS  = Number(process.env.PAYMENT_RECONCILE_TIMEOUT_MS  ?? 900_000);
const RECONCILE_INTERVAL_MS = Number(process.env.PAYMENT_RECONCILE_INTERVAL_MS ?? 600_000);
const ALERT_EVAL_INTERVAL_MS = Number(process.env.ALERT_EVAL_INTERVAL_MS       ?? 120_000);

// ── 对账扫描 ──────────────────────────────────────────────────────────────────

/**
 * 查询超时 pending 订单并记录审计日志
 * @returns 发现的超时订单数
 */
async function scanPendingOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - RECONCILE_TIMEOUT_MS);

  const pendingOrders = await db('payment_orders')
    .where({ status: 'pending' })
    .where('created_at', '<', cutoff)
    .select('id', 'user_id', 'channel', 'product_type', 'amount_cents', 'created_at');

  if (pendingOrders.length === 0) return 0;

  // 批量写审计日志（逐条，避免部分失败）
  for (const order of pendingOrders as Record<string, unknown>[]) {
    try {
      // 检查是否已有该订单的 reconcile_timeout 记录（防止每次扫描都写重复日志）
      const existing = await db('payment_audit_log')
        .where({ order_id: order['id'], event_type: 'reconcile_timeout' })
        .first();
      if (existing) continue;

      await db('payment_audit_log').insert({
        id: generateId(),
        order_id: order['id'],
        user_id: order['user_id'],
        event_type: 'reconcile_timeout',
        transaction_id: null,
        channel: order['channel'],
        raw_payload: JSON.stringify({
          created_at: order['created_at'],
          amount_cents: order['amount_cents'],
          product_type: order['product_type'],
          note: '对账扫描：订单超时未收到回调，需人工核查',
        }),
        callback_status: null,
        error: `Order pending for >${Math.round(RECONCILE_TIMEOUT_MS / 60_000)}min`,
        created_at: new Date(),
      });

      // 预留：接入真实渠道查单 API
      // const result = await queryPaymentProvider(order);
      // if (result?.status === 'paid') { await paymentService.handleCallback(...); }
    } catch (auditErr) {
      console.error('[PaymentScheduler] 写审计日志失败:', auditErr instanceof Error ? auditErr.message : auditErr);
    }
  }

  // 记录指标，触发告警评估
  metrics.inc('reconcile_triggered');
  metrics.inc('reconcile_pending_timeout', pendingOrders.length);

  console.warn(
    `[PaymentScheduler] 对账扫描发现 ${pendingOrders.length} 笔超时挂起订单，` +
    `orderId: ${(pendingOrders as Record<string, unknown>[]).map((o) => o['id']).join(', ')}`,
  );

  return pendingOrders.length;
}

// ── 告警评估 ──────────────────────────────────────────────────────────────────

async function runAlertEval(): Promise<void> {
  try {
    const snapshot = metrics.snapshot();
    const fired = await alertManager.evaluate(snapshot);
    if (fired.length > 0) {
      console.warn(`[AlertManager] 本轮触发 ${fired.length} 条告警:`, fired.map((f) => `[${f.level}] ${f.key}`).join(', '));
    }
  } catch (err) {
    console.error('[AlertManager] 告警评估异常:', err instanceof Error ? err.message : err);
  }
}

// ── 调度器生命周期 ────────────────────────────────────────────────────────────

let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let alertTimer: ReturnType<typeof setInterval> | null = null;

export function startPaymentScheduler(): void {
  if (reconcileTimer || alertTimer) {
    console.warn('[PaymentScheduler] 调度器已启动，跳过重复启动');
    return;
  }

  // 启动时立即执行一次，之后按间隔循环
  void scanPendingOrders().catch((err) =>
    console.error('[PaymentScheduler] 首次对账扫描失败:', err instanceof Error ? err.message : err),
  );

  reconcileTimer = setInterval(async () => {
    try {
      await scanPendingOrders();
    } catch (err) {
      console.error('[PaymentScheduler] 对账扫描异常:', err instanceof Error ? err.message : err);
    }
  }, RECONCILE_INTERVAL_MS);

  alertTimer = setInterval(runAlertEval, ALERT_EVAL_INTERVAL_MS);

  console.log(
    `[PaymentScheduler] 已启动 | 对账间隔=${RECONCILE_INTERVAL_MS / 1000}s` +
    ` | 告警评估间隔=${ALERT_EVAL_INTERVAL_MS / 1000}s` +
    ` | 挂起阈值=${RECONCILE_TIMEOUT_MS / 1000}s`,
  );
}

export function stopPaymentScheduler(): void {
  if (reconcileTimer) { clearInterval(reconcileTimer); reconcileTimer = null; }
  if (alertTimer)     { clearInterval(alertTimer);     alertTimer     = null; }
  console.log('[PaymentScheduler] 已停止');
}
