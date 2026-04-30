/**
 * BusinessMetrics — 内存级业务指标计数器
 *
 * 职责：
 *   - 记录关键业务事件的发生次数（生命周期内累计 + 5 分钟滑动窗口）
 *   - 不依赖外部存储，零运维成本；水平扩展后各实例独立，通过日志聚合对账
 *   - 供 GET /api/metrics/business 端点读取，面向告警规则 / Grafana 轮询
 *
 * 内置事件：
 *   order_created        订单创建
 *   payment_callback     三方回调到达
 *   payment_succeeded    支付成功（回调 paid）
 *   payment_failed       支付失败
 *   grant_success        权益发放成功
 *   grant_failed         权益发放失败（事务异常）
 *   ai_request           AI 功能调用
 *   ai_quota_exceeded    AI 配额超限
 *   auth_register        注册
 *   auth_login           登录
 *   auth_login_failed    登录失败
 *   recruitment_apply    招募申请
 *   recruitment_group    成团
 *
 * 使用方式（路由或服务层）：
 *   import { metrics } from '../utils/business-metrics';
 *   metrics.inc('payment_succeeded');
 */

export type MetricEvent =
  | 'order_created'
  | 'payment_callback'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'grant_success'
  | 'grant_failed'
  | 'refund_requested'           // 退款发起
  | 'reconcile_triggered'        // 对账任务触发
  | 'reconcile_pending_timeout'  // 发现超时挂起订单
  | 'ai_request'
  | 'ai_quota_exceeded'
  | 'message_send_failed'        // 私信/消息发送失败
  | 'auth_register'
  | 'auth_login'
  | 'auth_login_failed'
  | 'recruitment_apply'
  | 'recruitment_group';

const WINDOW_MS = 5 * 60 * 1000; // 5 分钟滑动窗口
const BUCKET_COUNT = 12; // 每 25s 一个 bucket，12 个覆盖 5 分钟

interface Bucket {
  ts: number;    // bucket 起始时间戳
  counts: Partial<Record<MetricEvent, number>>;
}

class BusinessMetrics {
  /** 进程生命周期累计 */
  private total: Partial<Record<MetricEvent, number>> = {};
  /** 循环 bucket（时间窗口） */
  private buckets: Bucket[] = [];
  private readonly bucketDurationMs = Math.floor(WINDOW_MS / BUCKET_COUNT);

  /** 记录一次事件 */
  inc(event: MetricEvent, delta = 1): void {
    this.total[event] = (this.total[event] ?? 0) + delta;
    const bucket = this.currentBucket();
    bucket.counts[event] = (bucket.counts[event] ?? 0) + delta;
  }

  /**
   * 获取当前快照：
   *   - total: 进程启动累计
   *   - window_5m: 最近 5 分钟
   *   - rate_per_min: window_5m / 5（每分钟速率估算）
   */
  snapshot(): {
    total: Partial<Record<MetricEvent, number>>;
    window_5m: Partial<Record<MetricEvent, number>>;
    rate_per_min: Partial<Record<MetricEvent, number>>;
    uptime_seconds: number;
  } {
    const window_5m = this.aggregateWindow();
    const rate_per_min: Partial<Record<MetricEvent, number>> = {};
    for (const [k, v] of Object.entries(window_5m) as [MetricEvent, number][]) {
      rate_per_min[k] = Math.round((v / 5) * 100) / 100;
    }
    return {
      total: { ...this.total },
      window_5m,
      rate_per_min,
      uptime_seconds: Math.floor(process.uptime()),
    };
  }

  // ── 私有工具 ─────────────────────────────────────────────────────────────

  private currentBucket(): Bucket {
    const now = Date.now();
    const bucketStart = Math.floor(now / this.bucketDurationMs) * this.bucketDurationMs;
    const last = this.buckets[this.buckets.length - 1];
    if (last && last.ts === bucketStart) return last;

    // 新建 bucket，同时清理过期 bucket（超出窗口的）
    const cutoff = now - WINDOW_MS;
    this.buckets = this.buckets.filter((b) => b.ts > cutoff);
    const next: Bucket = { ts: bucketStart, counts: {} };
    this.buckets.push(next);
    return next;
  }

  private aggregateWindow(): Partial<Record<MetricEvent, number>> {
    const cutoff = Date.now() - WINDOW_MS;
    const result: Partial<Record<MetricEvent, number>> = {};
    for (const bucket of this.buckets) {
      if (bucket.ts <= cutoff) continue;
      for (const [k, v] of Object.entries(bucket.counts) as [MetricEvent, number][]) {
        result[k] = (result[k] ?? 0) + v;
      }
    }
    return result;
  }
}

/** 单例，全进程共享 */
export const metrics = new BusinessMetrics();
