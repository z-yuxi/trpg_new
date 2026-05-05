/**
 * 会员与支付路�?
 *
 * GET  /api/membership/benefits          �?查询当前用户有效档位和所有权�?
 * POST /api/membership/grant             �?运营手工授予会员（需 admin�?
 * GET  /api/membership/events            �?查询当前用户订阅事件历史
 *
 * POST /api/membership/orders            �?创建支付订单（前端发起，返回三方预付单参数）
 * GET  /api/membership/orders/:id        �?轮询订单状�?
 * POST /api/membership/orders/:id/cancel �?取消待支付订�?
 * POST /api/membership/webhook/:channel  �?三方支付回调（RSA2/SHA256 真实签名验证�?
 */
import { Router, type IRouter, type Request } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { membershipService } from '../services/membership-service';
import { db } from '../db';
import { generateId, MEMBERSHIP_BENEFITS } from '@trpg/shared';
import type { MembershipTier } from '@trpg/shared';
import { safeErrorMessage } from '../utils/error-response';
import {
  verifyAlipaySignature,
  verifyWechatPayV3Signature,
  decryptWechatResource,
  verifyHmacSignature,
  type WechatPayCallbackHeaders,
} from '../services/payment-verifier';
import {
  createAlipayWapOrder,
  createWechatJsapiOrder,
} from '../services/payment-gateway';
import { logError } from '../utils/structured-logger';

const router: IRouter = Router();

// GET /api/membership/benefits �?返回当前有效档位和权益列�?
router.get('/benefits', authMiddleware, async (req, res) => {
  try {
    const tier = await membershipService.getEffectiveTier(getAuthedUser(req).id);
    const benefits = MEMBERSHIP_BENEFITS[tier];
    res.json({
      tier,
      benefits,
      expires_at: getAuthedUser(req).subscription_expires_at ?? null,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Failed to get membership info') });
  }
});

// GET /api/membership/events �?当前用户订阅变更历史（最�?50 条）
router.get('/events', authMiddleware, async (req, res) => {
  try {
    const rows = await db('subscription_events')
      .where({ user_id: getAuthedUser(req).id })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Failed to get events') });
  }
});

const grantSchema = z.object({
  target_user_id: z.string().min(1),
  tier: z.enum(['pro', 'creator']),
  /** ISO 日期字符串，�?"2027-04-29T00:00:00Z" */
  expires_at: z.string().datetime(),
});

// POST /api/membership/grant �?admin 手工授予会员（仅管理员）
router.post('/grant', authMiddleware, async (req, res) => {
  const user = getAuthedUser(req);
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    await membershipService.grant({
      targetUserId: parsed.data.target_user_id,
      tier: parsed.data.tier,
      expiresAt: new Date(parsed.data.expires_at),
      operatorId: user.id,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Grant failed') });
  }
});

// ── 支付订单 SKU 定义 ─────────────────────────────────────────────────────────
const SKU_CATALOG: Record<string, { product_type: string; tier: MembershipTier; months: number; amount_cents: number; label: string }> = {
  pro_monthly:     { product_type: 'sub_pro',     tier: 'pro',     months: 1,  amount_cents: 1800, label: 'Pro 会员 · 月付' },
  pro_yearly:      { product_type: 'sub_pro',     tier: 'pro',     months: 12, amount_cents: 19800, label: 'Pro 会员 · 年付' },
  creator_monthly: { product_type: 'sub_creator', tier: 'creator', months: 1,  amount_cents: 3800, label: 'Creator 会员 · 月付' },
  creator_yearly:  { product_type: 'sub_creator', tier: 'creator', months: 12, amount_cents: 38800, label: 'Creator 会员 · 年付' },
};

const createOrderSchema = z.object({
  sku: z.string().min(1),
  channel: z.enum(['alipay', 'wechat']),
});

// POST /api/membership/orders �?创建支付订单
router.post('/orders', authMiddleware, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const sku = SKU_CATALOG[parsed.data.sku];
  if (!sku) {
    res.status(400).json({ error: `未知 SKU: ${parsed.data.sku}`, available_skus: Object.keys(SKU_CATALOG) });
    return;
  }
  try {
    const orderId = generateId();
    await db('payment_orders').insert({
      id: orderId,
      user_id: getAuthedUser(req).id,
      product_type: sku.product_type,
      product_sku: parsed.data.sku,
      amount_cents: sku.amount_cents,
      channel: parsed.data.channel,
      status: 'pending',
      metadata: JSON.stringify({ label: sku.label, months: sku.months }),
    });
    // 生成三方预付单参�?
    let payParams: Record<string, unknown> | null = null;
    try {
      if (parsed.data.channel === 'alipay') {
        const result = await createAlipayWapOrder({
          outTradeNo: orderId,
          totalAmount: (sku.amount_cents / 100).toFixed(2),
          subject: sku.label,
          quitUrl: process.env.FRONTEND_BASE_URL ?? 'https://example.com',
        });
        if (result) payParams = { channel: 'alipay', pay_url: result.payUrl };
      } else if (parsed.data.channel === 'wechat') {
        // WeChat JSAPI 需�?openid，从 request header 获取（前端在创建订单时传入）
        const openid = (req as Request & { body: { openid?: string } }).body.openid;
        if (openid) {
          const result = await createWechatJsapiOrder({
            outTradeNo: orderId,
            totalAmountCents: sku.amount_cents,
            description: sku.label,
            openid,
          });
          if (result) payParams = { channel: 'wechat', jsapi: result };
        }
      }
    } catch {
      // 支付参数生成失败不影响订单记录，前端可降级展示手动联系客服
    }
    res.status(201).json({
      order_id: orderId,
      amount_cents: sku.amount_cents,
      label: sku.label,
      status: 'pending',
      pay_params: payParams,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Order creation failed') });
  }
});

// GET /api/membership/orders/:id �?轮询订单状�?
router.get('/orders/:id', authMiddleware, async (req, res) => {
  try {
    const order = await db('payment_orders').where({ id: req.params.id, user_id: getAuthedUser(req).id }).first();
    if (!order) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({
      order_id: order.id,
      status: order.status,
      paid_at: order.paid_at ?? null,
      amount_cents: order.amount_cents,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// POST /api/membership/orders/:id/cancel �?取消待支付订�?
router.post('/orders/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const order = await db('payment_orders').where({ id: req.params.id, user_id: getAuthedUser(req).id, status: 'pending' }).first();
    if (!order) { res.status(404).json({ error: 'Order not found or cannot be cancelled' }); return; }
    await db('payment_orders').where({ id: req.params.id }).update({ status: 'failed' });
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Cancel failed') });
  }
});

// POST /api/membership/webhook/:channel �?三方支付回调（RSA2/SHA256 真实签名验证�?
router.post('/webhook/:channel', async (req, res) => {
  const channel = req.params.channel as 'alipay' | 'wechat';
  if (!['alipay', 'wechat'].includes(channel)) {
    res.status(400).json({ error: 'Unknown channel' });
    return;
  }

  // ── 签名验证 ──────────────────────────────────────────────────────────────
  if (channel === 'alipay') {
    const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY_PEM;
    if (alipayPublicKey) {
      const params = req.body as Record<string, string>;
      if (!verifyAlipaySignature(params, alipayPublicKey)) {
        res.status(401).json({ error: 'Invalid Alipay signature' });
        return;
      }
    } else {
      // 无公钥时降级�?HMAC（仅测试环境）；若两者均未配置则拒绝（fail-closed�?
      const hmacSecret = process.env.PAYMENT_WEBHOOK_SECRET_ALIPAY;
      if (!hmacSecret) {
        res.status(503).json({ error: 'Alipay webhook not configured' });
        return;
      }
      if (!verifyHmacSignature(req.headers['x-payment-signature'] as string, JSON.stringify(req.body), hmacSecret)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }
  } else if (channel === 'wechat') {
    const wechatPublicKey = process.env.WECHAT_PAY_PUBLIC_KEY_PEM;
    if (wechatPublicKey) {
      const headers: WechatPayCallbackHeaders = {
        timestamp: req.headers['wechatpay-timestamp'] as string,
        nonce:     req.headers['wechatpay-nonce'] as string,
        signature: req.headers['wechatpay-signature'] as string,
        serial:    req.headers['wechatpay-serial'] as string,
      };
      // LOW-fix: 校验时间戳在 ±5 分钟内，防重�?
      const tsMs = Number(headers.timestamp) * 1000;
      if (!headers.timestamp || Number.isNaN(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
        res.status(401).json({ error: 'WeChat Pay timestamp expired or missing' });
        return;
      }
      const rawBody = JSON.stringify(req.body);
      if (!verifyWechatPayV3Signature(headers, rawBody, wechatPublicKey)) {
        res.status(401).json({ error: 'Invalid WeChat Pay signature' });
        return;
      }
      // 解密 resource 字段（微�?v3 回调加密�?
      const resource = (req.body as Record<string, unknown>)['resource'] as Record<string, string> | undefined;
      if (resource?.ciphertext) {
        const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
        if (apiV3Key) {
          try {
            const decrypted = decryptWechatResource({
              ciphertext: resource.ciphertext,
              nonce: resource.nonce,
              associatedData: resource.associated_data ?? '',
              apiV3Key,
            });
            req.body = decrypted;
          } catch {
            res.status(400).json({ error: 'Failed to decrypt WeChat resource' });
            return;
          }
        }
      }
    } else {
      // 无证书时降级�?HMAC（仅测试环境）；若两者均未配置则拒绝（fail-closed�?
      const hmacSecret = process.env.PAYMENT_WEBHOOK_SECRET_WECHAT;
      if (!hmacSecret) {
        res.status(503).json({ error: 'WeChat Pay webhook not configured' });
        return;
      }
      if (!verifyHmacSignature(req.headers['x-payment-signature'] as string, JSON.stringify(req.body), hmacSecret)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }
  }

  // ── 提取三方流水号与订单 ID ──────────────────────────────────────────────
  const body = req.body as Record<string, unknown>;
  const outTradeNo = String(body['out_trade_no'] ?? body['order_id'] ?? '');
  const externalOrderId = String(body['trade_no'] ?? body['transaction_id'] ?? '');
  const tradeStatus = String(body['trade_status'] ?? body['result_code'] ?? '');

  const isPaid = tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'SUCCESS' || tradeStatus === 'success';
  if (!isPaid || !outTradeNo) {
    res.json({ ok: true }); // 非终态，幂等返回 200
    return;
  }

  try {
    const order = await db('payment_orders').where({ id: outTradeNo, status: 'pending' }).first();
    if (!order) {
      res.json({ ok: true }); // 已处理或不存在，幂等
      return;
    }

    // 事务：更新订�?�?更新用户会员 �?�?subscription_event
    await db.transaction(async (trx) => {
      await trx('payment_orders').where({ id: outTradeNo }).update({
        status: 'paid',
        external_order_id: externalOrderId || null,
        paid_at: trx.fn.now(),
      });

      const sku = SKU_CATALOG[order.product_sku as string];
      if (!sku) return;

      const currentUser = await trx('users')
        .where({ id: order.user_id })
        .select('subscription_type', 'subscription_expires_at')
        .first();

      const now = new Date();
      const baseDate =
        currentUser?.subscription_expires_at && new Date(currentUser.subscription_expires_at) > now
          ? new Date(currentUser.subscription_expires_at)
          : now;
      const expiresAt = new Date(baseDate);
      expiresAt.setMonth(expiresAt.getMonth() + sku.months);

      await trx('users').where({ id: order.user_id }).update({
        subscription_type: sku.tier,
        subscription_expires_at: expiresAt,
      });

      await trx('subscription_events').insert({
        id: generateId(),
        user_id: order.user_id,
        event_type: currentUser?.subscription_type === 'free' ? 'subscribe' : 'renew',
        from_tier: currentUser?.subscription_type ?? 'free',
        to_tier: sku.tier,
        order_id: outTradeNo,
        expires_at: expiresAt,
        metadata: JSON.stringify({ channel, external_order_id: externalOrderId }),
      });
    });

    res.json({ ok: true });
  } catch (err: unknown) {
    logError('WEBHOOK_HANDLER_FAILED', 'high', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
