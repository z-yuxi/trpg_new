/**
 * 内容支付路由 — 购买模组/规则集等付费内容
 *
 * 产品设计依据：附录 H03：支付与货币系统
 * 注意：公测期间不接入真实支付，订单仅记录状态，pay_params 为 null。
 *
 * POST   /api/payments/orders                  — 创建内容购买订单
 * GET    /api/payments/orders                  — 查询当前用户历史订单
 * GET    /api/payments/orders/:id              — 查询单个订单状态
 * POST   /api/payments/orders/:id/cancel       — 取消待支付订单
 * POST   /api/payments/webhook/:channel        — 三方支付回调（RSA2/RSA-SHA256 生产签名验证）
 * GET    /api/payments/access/:type/:id        — 检查内容访问权限
 * POST   /api/payments/admin/manual-grant      — 运营补单（admin）
 * POST   /api/payments/admin/refund            — 运营退款（admin，可审计）
 */
import { Router, type IRouter, type Request } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { generateId } from '@trpg/shared';
import { paymentService, PaymentError } from '../services/payment-service';
import { metrics } from '../utils/business-metrics';
import {
  verifyAlipaySignature,
  verifyWechatPayV3Signature,
  decryptWechatResource,
  verifyHmacSignature,
  type WechatPayCallbackHeaders,
} from '../services/payment-verifier';
import { paymentCreateLimiter, paymentWebhookLimiter } from '../middleware/rate-limiter';

const router: IRouter = Router();

// ── 创建订单 Schema ───────────────────────────────────────────────────────────
const createOrderSchema = z.object({
  product_type: z.enum(['module', 'ruleset']),
  product_id: z.string().min(1).max(64),
  payment_method: z.enum(['alipay', 'wechat', 'coins']),
});

// POST /api/payments/orders — 创建内容购买订单
router.post('/orders', authMiddleware, paymentCreateLimiter, async (req, res) => {
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
    metrics.inc('order_created');
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

// ── 签名验证辅助 ─────────────────────────────────────────────────────────────

/**
 * 验证支付宝异步通知（application/x-www-form-urlencoded 表单参数）
 * 需配置环境变量 ALIPAY_PUBLIC_KEY_PEM
 */
function verifyAlipay(req: Request): boolean {
  const publicKey = process.env.ALIPAY_PUBLIC_KEY_PEM;
  // 未配置公钥：生产环境直接拒绝；测试环境（NODE_ENV=test）放行
  if (!publicKey) {
    if (process.env.NODE_ENV === 'test') return true;
    return false;
  }
  const params = req.body as Record<string, string>;
  return verifyAlipaySignature(params, publicKey);
}

/**
 * 验证微信支付 v3 回调（JSON body + HTTP 头部签名）
 * 需配置环境变量 WECHAT_PAY_PUBLIC_KEY_PEM 和 WECHAT_PAY_API_V3_KEY
 */
function verifyWechat(req: Request): { ok: boolean; decrypted?: Record<string, unknown> } {
  const publicKey = process.env.WECHAT_PAY_PUBLIC_KEY_PEM;
  if (!publicKey) {
    if (process.env.NODE_ENV === 'test') return { ok: true };
    return { ok: false };
  }

  const headers: WechatPayCallbackHeaders = {
    timestamp: req.headers['wechatpay-timestamp'] as string ?? '',
    nonce:     req.headers['wechatpay-nonce']     as string ?? '',
    signature: req.headers['wechatpay-signature'] as string ?? '',
    serial:    req.headers['wechatpay-serial']    as string ?? '',
  };
  if (!headers.timestamp || !headers.nonce || !headers.signature) return { ok: false };

  // rawBody 由 express.json 解析前的原始 body（生产需配置 express.raw 中间件保存原始串）
  // 这里使用重新序列化的方式，适用于 JSON body 无重排序的场景
  const rawBody = JSON.stringify(req.body);
  const sigOk = verifyWechatPayV3Signature(headers, rawBody, publicKey);
  if (!sigOk) return { ok: false };

  // 解密 resource 字段（若存在）
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
  const resource = (req.body as Record<string, unknown>).resource as Record<string, string> | undefined;
  if (resource?.ciphertext && apiV3Key) {
    try {
      const plain = decryptWechatResource({
        ciphertext: resource.ciphertext,
        nonce: resource.nonce,
        associatedData: resource.associated_data ?? '',
        apiV3Key,
      });
      return { ok: true, decrypted: JSON.parse(plain) as Record<string, unknown> };
    } catch {
      return { ok: false };
    }
  }

  return { ok: true };
}

// POST /api/payments/webhook/:channel — 三方支付回调（生产签名验证）
router.post('/webhook/:channel', paymentWebhookLimiter, async (req, res) => {
  const channel = req.params.channel;
  if (!['alipay', 'wechat'].includes(channel)) {
    res.status(400).json({ error: 'Unknown channel' });
    return;
  }

  // ── 签名验证 ────────────────────────────────────────────────────────────────
  let wechatDecrypted: Record<string, unknown> | undefined;

  if (channel === 'alipay') {
    if (!verifyAlipay(req)) {
      res.status(401).json({ error: 'Alipay signature verification failed' });
      return;
    }
  } else {
    // 先尝试 WeChat Pay v3 RSA 验签
    const wechatResult = verifyWechat(req);
    if (!wechatResult.ok) {
      // 降级：内部 HMAC-SHA256（仅限测试/内网场景）
      const secret = process.env.PAYMENT_WEBHOOK_SECRET_WECHAT;
      if (secret) {
        const sig = req.headers['x-payment-signature'] as string | undefined;
        if (!sig || !verifyHmacSignature(JSON.stringify(req.body), sig, secret)) {
          res.status(401).json({ error: 'WeChat signature verification failed' });
          return;
        }
      } else {
        res.status(401).json({ error: 'WeChat signature verification failed' });
        return;
      }
    }
    wechatDecrypted = wechatResult.decrypted;
  }

  // ── 提取订单字段（兼容 WeChat 解密后结构 & Alipay 表单参数）────────────────
  // Alipay:   body.out_trade_no = 商户订单号, body.trade_no = 支付宝流水号, body.trade_status
  // WeChat v3: 解密后 resource.out_trade_no, resource.transaction_id, resource.trade_state
  const payload = wechatDecrypted ?? (req.body as Record<string, unknown>);

  const order_id      = (payload['out_trade_no'] ?? payload['order_id'])       as string | undefined;
  const transaction_id = (payload['trade_no']    ?? payload['transaction_id'])  as string | undefined;
  const rawStatus     = (payload['trade_status'] ?? payload['trade_state']     ?? payload['status']) as string | undefined;

  const { order_id: _1, transaction_id: _2, status: _3, ...rest } = req.body as Record<string, string>;
  void rest; // 保留 rawPayload，下面使用 payload 原始对象

  if (!order_id || !transaction_id) {
    res.status(400).json({ error: 'Missing order_id or transaction_id' });
    return;
  }

  // 标准化渠道状态（WeChat: SUCCESS/FAIL，Alipay: TRADE_SUCCESS/TRADE_CLOSED，内部测试: paid/failed）
  const callbackStatus: 'paid' | 'failed' =
    rawStatus === 'paid' || rawStatus === 'SUCCESS' || rawStatus === 'TRADE_SUCCESS'
      ? 'paid'
      : 'failed';

  try {
    const result = await paymentService.handleCallback({
      orderId: order_id,
      transactionId: transaction_id,
      callbackStatus,
      rawPayload: req.body as Record<string, unknown>,
    });
    metrics.inc('payment_callback');
    if (callbackStatus === 'paid') {
      metrics.inc(result.idempotent ? 'payment_callback' : 'payment_succeeded');
      if (!result.idempotent) metrics.inc('grant_success');
    } else {
      metrics.inc('payment_failed');
    }
    res.json({ ok: result.ok, idempotent: result.idempotent ?? false });
  } catch (err: unknown) {
    metrics.inc('grant_failed');
    if (err instanceof PaymentError) {
      res.status(err.httpStatus).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Webhook processing failed' });
  }
});

// GET /api/payments/access/:type/:id — 检查当前用户是否有内容访问权限
router.get('/access/:type/:id', authMiddleware, async (req, res) => {
  const { type, id } = req.params;
  if (type !== 'module' && type !== 'ruleset') {
    res.status(400).json({ error: 'Invalid content type' });
    return;
  }
  try {
    const hasAccess = await paymentService.hasContentAccess(
      req.user!.id,
      type as 'module' | 'ruleset',
      id,
    );
    res.json({ has_access: hasAccess });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Query failed' });
  }
});

// POST /api/payments/admin/manual-grant — 运营补单（需 admin 权限）
router.post('/admin/manual-grant', authMiddleware, async (req, res) => {
  const user = req.user!;
  if (!Array.isArray(user.user_type) || !user.user_type.includes('admin')) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  const { order_id, note } = req.body as { order_id?: string; note?: string };
  if (!order_id) { res.status(400).json({ error: 'Missing order_id' }); return; }

  try {
    await paymentService.manualGrant({ orderId: order_id, operatorId: user.id, note });
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof PaymentError) {
      res.status(err.httpStatus).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Manual grant failed' });
  }
});

// POST /api/payments/admin/refund — 运营退款（需 admin 权限，完整审计）
// body: { order_id, reason, revoke_access? }
//   order_id      - 要退款的订单 ID
//   reason        - 退款原因（必填，写入审计日志）
//   revoke_access - 是否同步撤销内容访问权（默认 true）
router.post('/admin/refund', authMiddleware, async (req, res) => {
  const user = req.user!;
  if (!Array.isArray(user.user_type) || !user.user_type.includes('admin')) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const { order_id, reason, revoke_access = true } = req.body as {
    order_id?: string;
    reason?: string;
    revoke_access?: boolean;
  };
  if (!order_id) { res.status(400).json({ error: 'Missing order_id' }); return; }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    res.status(400).json({ error: 'reason is required for audit' });
    return;
  }

  try {
    await paymentService.adminRefund({
      orderId: order_id,
      operatorId: user.id,
      reason: reason.trim(),
      revokeAccess: revoke_access !== false,
    });
    metrics.inc('refund_requested');
    res.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof PaymentError) {
      res.status(err.httpStatus).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'Refund failed' });
  }
});

export default router;
