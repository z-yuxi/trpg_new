/**
 * PaymentService — 支付主链路服务
 *
 * 职责：
 *   1. 处理三方支付回调（幂等）
 *   2. 根据订单类型发放权益（内容访问 / 会员订阅 / 积分充值）
 *   3. 写审计日志（每次回调均写，无论成功失败）
 *
 * 调用方：routes/payments.ts  POST /api/payments/webhook/:channel
 *
 * 幂等策略：
 *   - 以 transaction_id（三方流水号）为去重键
 *   - 检查 payment_orders.external_order_id，已存在且 status=paid → 幂等跳过
 *   - content_access_grants 使用唯一约束 (user_id, content_type, content_id)
 *     + INSERT IGNORE，保证即使重复触发也不会重复发权益
 *
 * 一致性策略：
 *   - 订单状态更新 + 权益发放 + 审计日志写入均在同一 DB 事务内
 *   - 事务失败时回滚所有操作，由支付渠道按指数退避重试
 *
 * 错误处理：
 *   - 业务错误（订单不存在、已取消）抛出 PaymentError，路由层返回 4xx
 *   - 意外异常向上抛出，路由层返回 5xx，审计日志写 grant_failed
 */
import { db } from '../db';
import { generateId } from '@trpg/shared';
import { membershipService } from './membership-service';
import type { MembershipTier } from '@trpg/shared';

// ── 错误类型 ──────────────────────────────────────────────────────────────────

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'ORDER_NOT_FOUND'
      | 'ORDER_ALREADY_CANCELLED'
      | 'UNSUPPORTED_PRODUCT_TYPE',
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type CallbackStatus = 'paid' | 'failed';
export type AuditEventType =
  | 'callback_received'
  | 'grant_success'
  | 'grant_failed'
  | 'idempotent_skip'
  | 'manual_grant';

export interface PaymentCallbackParams {
  orderId: string;
  transactionId: string;
  callbackStatus: CallbackStatus;
  rawPayload: Record<string, unknown>;
}

export interface PaymentCallbackResult {
  ok: boolean;
  /** 幂等跳过：该 transactionId 已处理，直接返回成功 */
  idempotent?: boolean;
  orderId: string;
}

// ── 会员订阅周期（月 → 毫秒） ─────────────────────────────────────────────────
const SUBSCRIPTION_DURATION_MS: Record<string, number> = {
  sub_pro_monthly: 30 * 24 * 60 * 60 * 1000,
  sub_creator_monthly: 30 * 24 * 60 * 60 * 1000,
  sub_pro_quarterly: 90 * 24 * 60 * 60 * 1000,
  sub_creator_quarterly: 90 * 24 * 60 * 60 * 1000,
  sub_pro_yearly: 365 * 24 * 60 * 60 * 1000,
  sub_creator_yearly: 365 * 24 * 60 * 60 * 1000,
};

// ── PaymentService ─────────────────────────────────────────────────────────────

export class PaymentService {
  /**
   * 处理支付回调（主链路入口）
   *
   * 流程：
   *   1. 加载订单，检查是否存在 / 已取消
   *   2. 幂等检查：external_order_id 已是 transactionId 且 status=paid → 跳过
   *   3. 开启事务：
   *      a. 更新订单状态（pending → paid / failed）
   *      b. paid 时调用 grantBenefits
   *      c. 写审计日志
   *   4. 返回结果
   */
  async handleCallback(params: PaymentCallbackParams): Promise<PaymentCallbackResult> {
    const { orderId, transactionId, callbackStatus, rawPayload } = params;

    // 1. 加载订单
    const order = await db('payment_orders').where({ id: orderId }).first();
    if (!order) {
      throw new PaymentError(`Order ${orderId} not found`, 'ORDER_NOT_FOUND', 404);
    }
    if (order.status === 'failed') {
      throw new PaymentError(`Order ${orderId} has been cancelled`, 'ORDER_ALREADY_CANCELLED', 400);
    }

    // 2. 幂等检查：相同 transactionId 且已 paid → 直接返回成功
    if (order.status === 'paid' && order.external_order_id === transactionId) {
      await this.writeAuditLog({
        orderId,
        userId: order.user_id,
        eventType: 'idempotent_skip',
        transactionId,
        channel: order.channel,
        callbackStatus,
        rawPayload,
      });
      return { ok: true, idempotent: true, orderId };
    }

    const rawPayloadStr = JSON.stringify(rawPayload).slice(0, 8192); // 防超大 payload

    // 3. 事务：更新 + 发权益 + 审计
    try {
      await db.transaction(async (trx) => {
        if (callbackStatus === 'paid') {
          await trx('payment_orders').where({ id: orderId }).update({
            status: 'paid',
            external_order_id: transactionId,
            paid_at: new Date(),
          });
          await this.grantBenefits(trx, order);
        } else {
          await trx('payment_orders').where({ id: orderId }).update({ status: 'failed' });
        }

        await trx('payment_audit_log').insert({
          id: generateId(),
          order_id: orderId,
          user_id: order.user_id,
          event_type: callbackStatus === 'paid' ? 'grant_success' : 'callback_received',
          transaction_id: transactionId,
          channel: order.channel,
          raw_payload: rawPayloadStr,
          callback_status: callbackStatus,
          error: null,
        });
      });
    } catch (err: unknown) {
      // 事务失败：只写审计日志（在事务外，确保落地）
      await this.writeAuditLog({
        orderId,
        userId: order.user_id,
        eventType: 'grant_failed',
        transactionId,
        channel: order.channel,
        callbackStatus,
        rawPayload,
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => { /* 审计日志写失败不遮盖原始异常 */ });
      throw err;
    }

    return { ok: true, orderId };
  }

  /**
   * 根据订单类型发放权益（在事务内调用）
   *
   * 支持的 product_type：
   *   - module / ruleset  → content_access_grants（INSERT IGNORE 防重复）
   *   - sub_pro / sub_creator → 更新 users 订阅字段 + 写 subscription_events
   *   - coins             → 增加 free_coins + 写 coin_transactions
   */
  async grantBenefits(
    trx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    order: Record<string, unknown>,
  ): Promise<void> {
    const productType = order.product_type as string;
    const userId = order.user_id as string;
    const metadata: Record<string, unknown> =
      typeof order.metadata === 'string'
        ? JSON.parse(order.metadata)
        : (order.metadata as Record<string, unknown>) ?? {};

    // ── 内容购买：模组 / 规则集 ──────────────────────────────────────────────
    if (productType === 'module' || productType === 'ruleset') {
      const contentId = (metadata.product_id as string | undefined) ?? '';
      if (!contentId) {
        throw new Error(`metadata.product_id missing for order ${order.id}`);
      }
      await trx('content_access_grants')
        .insert({
          id: generateId(),
          user_id: userId,
          content_type: productType,
          content_id: contentId,
          order_id: order.id as string,
          expires_at: null,
          granted_at: new Date(),
        })
        .onConflict(['user_id', 'content_type', 'content_id'])
        .ignore(); // 幂等：重复回调不重复发权益
      return;
    }

    // ── 会员订阅：专业版 / 创作者版 ──────────────────────────────────────────
    if (productType === 'sub_pro' || productType === 'sub_creator') {
      const tier: MembershipTier = productType === 'sub_pro' ? 'pro' : 'creator';
      const sku = (order.product_sku as string | undefined) ?? '';
      const durationMs = SUBSCRIPTION_DURATION_MS[sku] ?? 30 * 24 * 60 * 60 * 1000;

      // 若用户当前有未到期订阅，从到期时间续期；否则从 now 起算
      const currentUser = await trx('users')
        .where({ id: userId })
        .select('subscription_type', 'subscription_expires_at')
        .first();
      const baseTime =
        currentUser?.subscription_expires_at &&
        new Date(currentUser.subscription_expires_at) > new Date()
          ? new Date(currentUser.subscription_expires_at)
          : new Date();
      const expiresAt = new Date(baseTime.getTime() + durationMs);

      await trx('users').where({ id: userId }).update({
        subscription_type: tier,
        subscription_expires_at: expiresAt,
      });
      await trx('subscription_events').insert({
        id: generateId(),
        user_id: userId,
        event_type: 'subscribe',
        from_tier: currentUser?.subscription_type ?? 'free',
        to_tier: tier,
        order_id: order.id as string,
        expires_at: expiresAt,
        created_at: new Date(),
      });
      return;
    }

    // ── 积分充值 ──────────────────────────────────────────────────────────────
    if (productType === 'coins') {
      const coinsAmount = Number((metadata.coins_amount as string | number | undefined) ?? 0);
      if (coinsAmount <= 0) {
        throw new Error(`Invalid coins_amount for order ${order.id}`);
      }

      // 使用 raw 原子自增，避免并发问题
      const [updated] = await trx('users')
        .where({ id: userId })
        .update({ free_coins: trx.raw('free_coins + ?', [coinsAmount]) })
        .returning(['free_coins']);

      // SQLite 不支持 RETURNING，回退查询
      const newBalance =
        updated?.free_coins ??
        ((await trx('users').where({ id: userId }).select('free_coins').first())?.free_coins ?? 0);

      await trx('coin_transactions').insert({
        id: generateId(),
        user_id: userId,
        tx_type: 'purchase',
        delta: coinsAmount,
        balance_after: Number(newBalance),
        ref_id: order.id as string,
        note: `充值 ${coinsAmount} 积分`,
        created_at: new Date(),
      });
      return;
    }

    throw new PaymentError(
      `Unsupported product_type: ${productType}`,
      'UNSUPPORTED_PRODUCT_TYPE',
      400,
    );
  }

  /**
   * 检查用户是否持有某项内容的访问权限
   * （内容购买记录 OR 内容本身免费）
   */
  async hasContentAccess(
    userId: string,
    contentType: 'module' | 'ruleset',
    contentId: string,
  ): Promise<boolean> {
    const grant = await db('content_access_grants')
      .where({ user_id: userId, content_type: contentType, content_id: contentId })
      .whereRaw('(expires_at IS NULL OR expires_at > ?)', [new Date()])
      .first();
    return !!grant;
  }

  /**
   * 运营手动补单：直接发放权益（绕过支付回调）
   * 写审计日志 event_type=manual_grant，可溯源到操作人
   */
  async manualGrant(params: {
    orderId: string;
    operatorId: string;
    note?: string;
  }): Promise<void> {
    const order = await db('payment_orders').where({ id: params.orderId }).first();
    if (!order) {
      throw new PaymentError(`Order ${params.orderId} not found`, 'ORDER_NOT_FOUND', 404);
    }

    await db.transaction(async (trx) => {
      await this.grantBenefits(trx, order);
      await trx('payment_orders').where({ id: params.orderId }).update({
        status: 'paid',
        paid_at: new Date(),
      });
      await trx('payment_audit_log').insert({
        id: generateId(),
        order_id: params.orderId,
        user_id: order.user_id as string,
        event_type: 'manual_grant',
        transaction_id: null,
        channel: order.channel,
        raw_payload: JSON.stringify({ operator_id: params.operatorId, note: params.note }),
        callback_status: 'paid',
        error: null,
      });
    });
  }

  // ── 私有工具 ──────────────────────────────────────────────────────────────

  private async writeAuditLog(params: {
    orderId: string;
    userId: string;
    eventType: AuditEventType;
    transactionId?: string;
    channel?: string;
    callbackStatus?: string;
    rawPayload?: Record<string, unknown>;
    error?: string;
  }): Promise<void> {
    await db('payment_audit_log').insert({
      id: generateId(),
      order_id: params.orderId,
      user_id: params.userId,
      event_type: params.eventType,
      transaction_id: params.transactionId ?? null,
      channel: params.channel ?? null,
      raw_payload: params.rawPayload ? JSON.stringify(params.rawPayload).slice(0, 8192) : null,
      callback_status: params.callbackStatus ?? null,
      error: params.error ?? null,
      created_at: new Date(),
    });
  }
}

export const paymentService = new PaymentService();
