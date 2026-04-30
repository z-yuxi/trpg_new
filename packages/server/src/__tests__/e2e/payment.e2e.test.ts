/**
 * E2E — 支付主链路测试
 *
 * 验证关键路径：
 *   1. 创建订单（模组购买）
 *   2. 三方支付回调（paid）→ 权益发放 → 审计日志
 *   3. 幂等回调（相同 transaction_id 第二次）
 *   4. 查询订单列表 / 单个订单
 *   5. GET /access/module/:id 校验已购权限
 *   6. 查询失败回调（failed）→ 订单状态更新
 *   7. 未授权访问各端点
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { request, registerAndLogin, rows } from './setup';
import crypto from 'crypto';

/** 用签名密钥构造正确的支付回调签名 */
function makeSignature(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('E2E — 支付链路', () => {
  let token: string;
  let moduleId: string;

  beforeEach(async () => {
    // 清理支付相关表，避免测试间干扰
    rows.payment_orders = [];
    rows.content_access_grants = [];
    rows.payment_audit_log = [];
    rows.coin_transactions = [];
    rows.subscription_events = [];

    // 注册登录用户
    const phone = '137' + Date.now().toString().slice(-8);
    token = await registerAndLogin(phone);

    // 在内存 DB 中插入一个付费模组（price_cents=1000）
    moduleId = 'mod-' + Date.now();
    rows.modules.push({
      id: moduleId,
      name: '神秘孤岛',
      price_cents: 1000,
      status: 'public',
      author_id: 'system',
    });
  });

  // ── 1. 创建订单 ──────────────────────────────────────────────────────────────
  describe('POST /api/payments/orders', () => {
    it('已登录用户可创建模组购买订单，返回 pending 订单', async () => {
      const res = await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module', product_id: moduleId, payment_method: 'alipay' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.amount).toBe(1000);
      expect(res.body.id).toBeDefined();
    });

    it('未登录用户创建订单返回 401', async () => {
      const res = await request
        .post('/api/payments/orders')
        .send({ product_type: 'module', product_id: moduleId, payment_method: 'alipay' });
      expect(res.status).toBe(401);
    });

    it('缺少必要字段返回 400', async () => {
      const res = await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module' }); // 缺少 product_id
      expect(res.status).toBe(400);
    });

    it('模组不存在返回 404', async () => {
      const res = await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module', product_id: 'non-existent-mod', payment_method: 'alipay' });
      expect(res.status).toBe(404);
    });
  });

  // ── 2. 支付回调：paid ─────────────────────────────────────────────────────────
  describe('POST /api/payments/webhook/:channel — paid', () => {
    it('paid 回调：订单变为 paid，写 content_access_grants 和 payment_audit_log', async () => {
      // 先创建订单
      const createRes = await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module', product_id: moduleId, payment_method: 'alipay' });
      expect(createRes.status).toBe(201);
      const orderId = createRes.body.id;

      // 发起 paid 回调
      const webhookBody = { order_id: orderId, transaction_id: 'txn-001', status: 'paid' };
      const webhookRes = await request
        .post('/api/payments/webhook/alipay')
        .send(webhookBody);

      expect(webhookRes.status).toBe(200);
      expect(webhookRes.body.ok).toBe(true);
      expect(webhookRes.body.idempotent).toBe(false);

      // 订单状态变为 paid
      const order = rows.payment_orders.find((o: any) => o.id === orderId);
      expect(order?.status).toBe('paid');
      expect(order?.external_order_id).toBe('txn-001');

      // 写了 content_access_grants
      const grant = rows.content_access_grants.find((g: any) => g.content_id === moduleId);
      expect(grant).toBeDefined();
      expect(grant?.content_type).toBe('module');

      // 写了 payment_audit_log
      const audit = rows.payment_audit_log.find((a: any) => a.order_id === orderId);
      expect(audit).toBeDefined();
      expect(audit?.event_type).toBe('grant_success');
    });
  });

  // ── 3. 幂等回调 ──────────────────────────────────────────────────────────────
  describe('POST /api/payments/webhook — 幂等', () => {
    it('相同 transaction_id 第二次回调直接返回成功（idempotent=true）', async () => {
      // 创建订单 + 首次回调
      const createRes = await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module', product_id: moduleId, payment_method: 'alipay' });
      const orderId = createRes.body.id;

      const webhookBody = { order_id: orderId, transaction_id: 'txn-idem', status: 'paid' };
      await request.post('/api/payments/webhook/alipay').send(webhookBody);

      // 第二次相同回调
      const secondRes = await request.post('/api/payments/webhook/alipay').send(webhookBody);
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.ok).toBe(true);
      expect(secondRes.body.idempotent).toBe(true);

      // content_access_grants 只有一条（不重复发权益）
      const grants = rows.content_access_grants.filter((g: any) => g.content_id === moduleId);
      expect(grants.length).toBe(1);
    });
  });

  // ── 4. 查询订单 ──────────────────────────────────────────────────────────────
  describe('GET /api/payments/orders', () => {
    it('返回当前用户的订单列表', async () => {
      await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module', product_id: moduleId, payment_method: 'alipay' });

      const res = await request
        .get('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('未登录返回 401', async () => {
      const res = await request.get('/api/payments/orders');
      expect(res.status).toBe(401);
    });
  });

  // ── 5. 权限查询 ──────────────────────────────────────────────────────────────
  describe('GET /api/payments/access/:type/:id', () => {
    it('回调 paid 后查询内容权限返回 has_access=true', async () => {
      const createRes = await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module', product_id: moduleId, payment_method: 'alipay' });
      const orderId = createRes.body.id;

      await request
        .post('/api/payments/webhook/alipay')
        .send({ order_id: orderId, transaction_id: 'txn-access', status: 'paid' });

      const res = await request
        .get(`/api/payments/access/module/${moduleId}`)
        .set('Authorization', 'Bearer ' + token);

      expect(res.status).toBe(200);
      expect(res.body.has_access).toBe(true);
    });

    it('未购买时 has_access=false', async () => {
      const res = await request
        .get('/api/payments/access/module/unowned-mod-id')
        .set('Authorization', 'Bearer ' + token);

      expect(res.status).toBe(200);
      expect(res.body.has_access).toBe(false);
    });

    it('type 非法时返回 400', async () => {
      const res = await request
        .get('/api/payments/access/campaign/some-id')
        .set('Authorization', 'Bearer ' + token);
      expect(res.status).toBe(400);
    });
  });

  // ── 6. 支付失败回调 ───────────────────────────────────────────────────────────
  describe('POST /api/payments/webhook — failed', () => {
    it('failed 回调：订单变为 failed，不写 content_access_grants', async () => {
      const createRes = await request
        .post('/api/payments/orders')
        .set('Authorization', 'Bearer ' + token)
        .send({ product_type: 'module', product_id: moduleId, payment_method: 'alipay' });
      const orderId = createRes.body.id;

      const webhookRes = await request
        .post('/api/payments/webhook/alipay')
        .send({ order_id: orderId, transaction_id: 'txn-fail', status: 'failed' });

      expect(webhookRes.status).toBe(200);

      const order = rows.payment_orders.find((o: any) => o.id === orderId);
      expect(order?.status).toBe('failed');

      const grant = rows.content_access_grants.find((g: any) => g.content_id === moduleId);
      expect(grant).toBeUndefined();
    });
  });

  // ── 7. 非法渠道 ──────────────────────────────────────────────────────────────
  describe('POST /api/payments/webhook — 异常', () => {
    it('未知渠道返回 400', async () => {
      const res = await request
        .post('/api/payments/webhook/paypal') // 不支持
        .send({ order_id: 'x', transaction_id: 'y', status: 'paid' });
      expect(res.status).toBe(400);
    });

    it('缺少 order_id 或 transaction_id 返回 400', async () => {
      const res = await request
        .post('/api/payments/webhook/alipay')
        .send({ status: 'paid' }); // 缺少 order_id
      expect(res.status).toBe(400);
    });

    it('订单不存在返回 404', async () => {
      const res = await request
        .post('/api/payments/webhook/alipay')
        .send({ order_id: 'non-exist', transaction_id: 'txn-x', status: 'paid' });
      expect(res.status).toBe(404);
    });
  });
});
