/**
 * 内容支付路由 — 购买模组/规则集等付费内容
 *
 * 产品设计依据：附录 H03：支付与货币系统
 * 注意：公测期间不接入真实支付，订单仅记录状态，pay_params 为 null。
 *
 * POST   /api/payments/orders               — 创建内容购买订单
 * GET    /api/payments/orders               — 查询当前用户历史订单
 * GET    /api/payments/orders/:id           — 查询单个订单状态
 * POST   /api/payments/orders/:id/cancel    — 取消待支付订单
 * POST   /api/payments/webhook/:channel     — 三方支付回调（生产时替换签名验证）
 */
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { generateId } from '@trpg/shared';

const router: IRouter = Router();

// ── 创建订单 Schema ───────────────────────────────────────────────────────────
const createOrderSchema = z.object({
  product_type: z.enum(['module', 'ruleset']),
  product_id: z.string().min(1).max(64),
  payment_method: z.enum(['alipay', 'wechat', 'coins']),
});

// POST /api/payments/orders — 创建内容购买订单
router.post('/orders', authMiddleware, async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { product_type, product_id, payment_method } = parsed.data;
  const userId = req.user!.id;

  try {
    // 查询商品价格
    let productName = '';
    let amountCents = 0;

    if (product_type === 'module') {
      const mod = await db('modules').where({ id: product_id }).first();
      if (!mod) { res.status(404).json({ error: '模组不存在' }); return; }
      productName = mod.name ?? '模组';
      amountCents = Number(mod.price_cents ?? 0);
    } else {
      const rs = await db('rulesets').where({ id: product_id }).first();
      if (!rs) { res.status(404).json({ error: '规则集不存在' }); return; }
      productName = rs.name ?? '规则集';
      amountCents = Number(rs.price_cents ?? 0);
    }

    // 免费内容无需支付
    if (amountCents <= 0) {
      res.status(400).json({ error: '该内容为免费内容，无需创建订单' });
      return;
    }

    // 检查是否已购买
    const existing = await db('payment_orders')
      .where({ user_id: userId, product_type, status: 'paid' })
      .whereRaw("JSON_EXTRACT(metadata, '$.product_id') = ?", [product_id])
      .first();
    if (existing) {
      res.status(409).json({ error: '已购买该内容' });
      return;
    }

    const orderId = generateId();
    await db('payment_orders').insert({
      id: orderId,
      user_id: userId,
      product_type,
      product_sku: `${product_type}_${product_id}`,
      amount_cents: amountCents,
      channel: payment_method === 'coins' ? 'internal' : payment_method,
      status: 'pending',
      metadata: JSON.stringify({ product_id, product_name: productName, payment_method }),
    });

    res.status(201).json({
      id: orderId,
      order_no: orderId,
      product_type,
      product_id,
      product_name: productName,
      amount: amountCents,
      payment_method,
      status: 'pending',
      pay_url: null, // 公测期间不接入真实支付
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Order creation failed' });
  }
});

// GET /api/payments/orders — 查询当前用户历史订单列表
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const rows = await db('payment_orders')
      .where({ user_id: req.user!.id })
      .whereIn('product_type', ['module', 'ruleset'])
      .orderBy('created_at', 'desc')
      .limit(50);

    const result = rows.map((row: any) => {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {});
      return {
        id: row.id,
        order_no: row.id,
        product_type: row.product_type,
        product_id: meta.product_id ?? '',
        product_name: meta.product_name ?? '',
        amount: row.amount_cents,
        payment_method: meta.payment_method ?? row.channel,
        status: row.status,
        paid_at: row.paid_at ?? null,
        created_at: row.created_at,
      };
    });
    res.json({ data: result, total: result.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/payments/orders/:id — 查询单个订单状态
router.get('/orders/:id', authMiddleware, async (req, res) => {
  try {
    const row = await db('payment_orders')
      .where({ id: req.params.id, user_id: req.user!.id })
      .first();
    if (!row) { res.status(404).json({ error: 'Order not found' }); return; }

    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata ?? {});
    res.json({
      id: row.id,
      order_no: row.id,
      product_type: row.product_type,
      product_id: meta.product_id ?? '',
      product_name: meta.product_name ?? '',
      amount: row.amount_cents,
      payment_method: meta.payment_method ?? row.channel,
      status: row.status,
      paid_at: row.paid_at ?? null,
      created_at: row.created_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// POST /api/payments/orders/:id/cancel — 取消待支付订单
router.post('/orders/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const row = await db('payment_orders')
      .where({ id: req.params.id, user_id: req.user!.id, status: 'pending' })
      .first();
    if (!row) { res.status(404).json({ error: 'Order not found or cannot be cancelled' }); return; }
    await db('payment_orders').where({ id: req.params.id }).update({ status: 'failed' });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Cancel failed' });
  }
});

// POST /api/payments/webhook/:channel — 三方支付回调
// WARNING: 生产上线前必须替换为真实签名验证逻辑，当前仅骨架示例。
router.post('/webhook/:channel', async (req, res) => {
  const channel = req.params.channel;
  if (!['alipay', 'wechat'].includes(channel)) {
    res.status(400).json({ error: 'Unknown channel' });
    return;
  }

  // 签名验证占位（生产替换）
  const webhookSecret = process.env[`PAYMENT_WEBHOOK_SECRET_${channel.toUpperCase()}`];
  if (webhookSecret) {
    const sig = req.headers['x-payment-signature'] as string | undefined;
    const body = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    if (!sig || sig !== expected) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  const { order_id, transaction_id, status } = req.body as {
    order_id?: string;
    transaction_id?: string;
    status?: string;
  };

  if (!order_id) { res.status(400).json({ error: 'Missing order_id' }); return; }

  try {
    const row = await db('payment_orders').where({ id: order_id }).first();
    if (!row) { res.status(404).json({ error: 'Order not found' }); return; }

    // 幂等：已处理的订单直接返回成功
    if (row.status === 'paid') { res.json({ ok: true }); return; }

    if (status === 'paid' || status === 'SUCCESS') {
      await db('payment_orders').where({ id: order_id }).update({
        status: 'paid',
        external_order_id: transaction_id ?? null,
        paid_at: new Date(),
      });
      // TODO: 触发权益发放（content_access_grants 表，Phase 2 实现）
    } else if (status === 'failed' || status === 'FAIL') {
      await db('payment_orders').where({ id: order_id }).update({ status: 'failed' });
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Webhook processing failed' });
  }
});

export default router;
