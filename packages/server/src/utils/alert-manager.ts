/**
 * AlertManager — P0/P1 业务告警系统
 *
 * 职责：
 *   - 基于 BusinessMetrics 快照评估告警规则
 *   - P0（阻断级）：支付成功率崩盘、权益发放连续失败
 *   - P1（警告级）：AI 失败率偏高、消息发送失败率偏高、对账挂起偏多
 *   - 告警输出：console.error（永久）+ HTTP webhook（若配置 ALERT_WEBHOOK_URL）
 *   - 单 key 冷却：同一告警 key 在冷却期内不重复触发，防告警风暴
 *
 * 使用方式：
 *   import { alertManager } from '../utils/alert-manager';
 *   // 在定时任务或指标路由中触发检查
 *   await alertManager.evaluate(metrics.snapshot());
 *
 * 环境变量：
 *   ALERT_WEBHOOK_URL      - HTTP POST 接收告警的 URL（如企业微信机器人、飞书、钉钉）
 *   ALERT_COOLDOWN_MS      - 同 key 最小告警间隔（毫秒），默认 300_000（5 分钟）
 *   ALERT_P0_WEBHOOK_URL   - P0 专用 webhook（若不设则与 ALERT_WEBHOOK_URL 相同）
 */

import type { MetricEvent } from './business-metrics';

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type AlertLevel = 'P0' | 'P1';

export interface AlertFired {
  key: string;
  level: AlertLevel;
  message: string;
  value?: number;
  threshold?: number;
  firedAt: string; // ISO 8601
}

interface MetricsSnapshot {
  total: Partial<Record<MetricEvent, number>>;
  window_5m: Partial<Record<MetricEvent, number>>;
  rate_per_min: Partial<Record<MetricEvent, number>>;
  uptime_seconds: number;
}

interface AlertRule {
  key: string;
  level: AlertLevel;
  /** 冷却期（毫秒），覆盖全局默认 */
  cooldownMs?: number;
  /** 是否满足告警条件；返回 {triggered: true, message, value?, threshold?} 表示触发 */
  evaluate(snapshot: MetricsSnapshot): { triggered: boolean; message?: string; value?: number; threshold?: number };
}

// ── P0 / P1 规则定义 ──────────────────────────────────────────────────────────

/**
 * 支付成功率 = payment_succeeded / (payment_succeeded + payment_failed)
 * P0：5m 内有 ≥ 5 次回调且成功率 < 60%
 */
const PAYMENT_SUCCESS_RATE_RULE: AlertRule = {
  key: 'payment_success_rate_low',
  level: 'P0',
  evaluate(snapshot) {
    const succeeded = snapshot.window_5m.payment_succeeded ?? 0;
    const failed    = snapshot.window_5m.payment_failed    ?? 0;
    const total     = succeeded + failed;
    if (total < 5) return { triggered: false };
    const rate = succeeded / total;
    const threshold = 0.6;
    if (rate < threshold) {
      return {
        triggered: true,
        message: `支付成功率过低：${(rate * 100).toFixed(1)}%（5m 内 ${total} 次回调，${succeeded} 成功）`,
        value: Math.round(rate * 100),
        threshold: threshold * 100,
      };
    }
    return { triggered: false };
  },
};

/**
 * 权益发放失败：5m 内 grant_failed ≥ 2
 * P0：可能导致用户付钱没拿到权益，必须立即处理
 */
const GRANT_FAILED_RULE: AlertRule = {
  key: 'grant_failed_spike',
  level: 'P0',
  evaluate(snapshot) {
    const failed = snapshot.window_5m.grant_failed ?? 0;
    const threshold = 2;
    if (failed >= threshold) {
      return {
        triggered: true,
        message: `权益发放失败次数异常：5m 内 ${failed} 次 grant_failed（阈值 ${threshold}）`,
        value: failed,
        threshold,
      };
    }
    return { triggered: false };
  },
};

/**
 * AI 失败率（ai_quota_exceeded / ai_request）
 * P1：5m 内有 ≥ 10 次 AI 请求且超限率 > 40%
 */
const AI_FAILURE_RATE_RULE: AlertRule = {
  key: 'ai_quota_exceeded_high',
  level: 'P1',
  evaluate(snapshot) {
    const total    = snapshot.window_5m.ai_request       ?? 0;
    const exceeded = snapshot.window_5m.ai_quota_exceeded ?? 0;
    if (total < 10) return { triggered: false };
    const rate = exceeded / total;
    const threshold = 0.4;
    if (rate > threshold) {
      return {
        triggered: true,
        message: `AI 配额超限率偏高：${(rate * 100).toFixed(1)}%（5m 内 ${total} 次请求，${exceeded} 超限）`,
        value: Math.round(rate * 100),
        threshold: threshold * 100,
      };
    }
    return { triggered: false };
  },
};

/**
 * 消息发送失败：5m 内 message_send_failed ≥ 5
 * P1
 */
const MESSAGE_SEND_FAILED_RULE: AlertRule = {
  key: 'message_send_failed_spike',
  level: 'P1',
  evaluate(snapshot) {
    const failed = snapshot.window_5m.message_send_failed ?? 0;
    const threshold = 5;
    if (failed >= threshold) {
      return {
        triggered: true,
        message: `消息发送失败次数异常：5m 内 ${failed} 次（阈值 ${threshold}）`,
        value: failed,
        threshold,
      };
    }
    return { triggered: false };
  },
};

/**
 * 对账挂起：reconcile_pending_timeout ≥ 3（5m 内）
 * P1：有订单长时间未收到回调，需人工核查
 */
const RECONCILE_PENDING_RULE: AlertRule = {
  key: 'reconcile_pending_timeout',
  level: 'P1',
  evaluate(snapshot) {
    const count = snapshot.window_5m.reconcile_pending_timeout ?? 0;
    const threshold = 3;
    if (count >= threshold) {
      return {
        triggered: true,
        message: `支付对账超时：5m 内发现 ${count} 笔挂起订单（阈值 ${threshold}），请核查支付渠道`,
        value: count,
        threshold,
      };
    }
    return { triggered: false };
  },
};

const ALL_RULES: AlertRule[] = [
  PAYMENT_SUCCESS_RATE_RULE,
  GRANT_FAILED_RULE,
  AI_FAILURE_RATE_RULE,
  MESSAGE_SEND_FAILED_RULE,
  RECONCILE_PENDING_RULE,
];

// ── AlertManager ─────────────────────────────────────────────────────────────

class AlertManager {
  /** key → 上次触发时间戳 */
  private lastFired = new Map<string, number>();
  private readonly defaultCooldownMs: number;

  constructor() {
    this.defaultCooldownMs = Number(process.env.ALERT_COOLDOWN_MS ?? 300_000);
  }

  /**
   * 评估所有规则，对满足条件且不在冷却期内的规则触发告警
   * @returns 本次实际触发的告警列表
   */
  async evaluate(snapshot: MetricsSnapshot): Promise<AlertFired[]> {
    const fired: AlertFired[] = [];

    for (const rule of ALL_RULES) {
      const result = rule.evaluate(snapshot);
      if (!result.triggered) continue;

      const now = Date.now();
      const cooldown = rule.cooldownMs ?? this.defaultCooldownMs;
      const lastFiredAt = this.lastFired.get(rule.key) ?? 0;
      if (now - lastFiredAt < cooldown) continue; // 冷却中，跳过

      this.lastFired.set(rule.key, now);

      const alert: AlertFired = {
        key: rule.key,
        level: rule.level,
        message: result.message ?? rule.key,
        value: result.value,
        threshold: result.threshold,
        firedAt: new Date(now).toISOString(),
      };

      fired.push(alert);
      this.emit(alert);
      await this.sendWebhook(alert);
    }

    return fired;
  }

  /**
   * 获取所有规则的当前状态（用于 /api/metrics/alerts 端点）
   */
  evaluateSync(snapshot: MetricsSnapshot): Array<{
    key: string;
    level: AlertLevel;
    status: 'ok' | 'firing' | 'cooldown';
    message?: string;
  }> {
    const now = Date.now();
    return ALL_RULES.map((rule) => {
      const result = rule.evaluate(snapshot);
      if (!result.triggered) return { key: rule.key, level: rule.level, status: 'ok' as const };

      const lastFiredAt = this.lastFired.get(rule.key) ?? 0;
      const cooldown = rule.cooldownMs ?? this.defaultCooldownMs;
      const inCooldown = now - lastFiredAt < cooldown;

      return {
        key: rule.key,
        level: rule.level,
        status: inCooldown ? ('cooldown' as const) : ('firing' as const),
        message: result.message,
      };
    });
  }

  // ── 私有：输出 ──────────────────────────────────────────────────────────

  private emit(alert: AlertFired): void {
    const prefix = `[ALERT][${alert.level}][${alert.key}]`;
    if (alert.level === 'P0') {
      console.error(`${prefix} ${alert.message} | firedAt=${alert.firedAt}`);
    } else {
      console.warn(`${prefix} ${alert.message} | firedAt=${alert.firedAt}`);
    }
  }

  private async sendWebhook(alert: AlertFired): Promise<void> {
    const url =
      alert.level === 'P0'
        ? (process.env.ALERT_P0_WEBHOOK_URL ?? process.env.ALERT_WEBHOOK_URL)
        : process.env.ALERT_WEBHOOK_URL;

    if (!url) return;

    try {
      const payload = JSON.stringify({
        level: alert.level,
        key: alert.key,
        message: `[${alert.level}] ${alert.message}`,
        value: alert.value,
        threshold: alert.threshold,
        firedAt: alert.firedAt,
        service: process.env.SERVICE_NAME ?? 'trpg-server',
      });

      // 使用 Node.js 内置 fetch（Node 18+）
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.error(`[AlertManager] Webhook 响应非 2xx: ${res.status} ${url}`);
      }
    } catch (err) {
      // webhook 发送失败不能影响主流程，只记录日志
      console.error(`[AlertManager] Webhook 发送失败 (${url}):`, err instanceof Error ? err.message : err);
    }
  }
}

/** 单例，全进程共享 */
export const alertManager = new AlertManager();
