import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock 会被 vitest 自动提升到文件顶部
vi.mock('../db', () => ({ db: vi.fn() }));
vi.mock('@trpg/shared', () => ({
  generateId: () => 'test-id-' + Math.random().toString(36).slice(2, 8),
}));

import { db } from '../db';
import { PaymentService, PaymentError } from '../services/payment-service';

const mockDb = vi.mocked(db);

// ── DB 链 Mock 工具 ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(firstValue: unknown = null, resolveRows: unknown[] = []): any {
  const rowsPromise = Promise.resolve(resolveRows);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {
    where:      vi.fn(),
    andWhere:   vi.fn(),
    whereRaw:   vi.fn(),
    select:     vi.fn(),
    orderBy:    vi.fn(),
    limit:      vi.fn(),
    first:      vi.fn().mockResolvedValue(firstValue),
    update:     vi.fn().mockResolvedValue(1),
    // insert/onConflict/ignore 必须返回 chain 以支持链式
    insert:     vi.fn(),
    onConflict: vi.fn(),
    ignore:     vi.fn(),
    returning:  vi.fn(),
    raw:        vi.fn().mockReturnValue('free_coins + 100'),
    then:       rowsPromise.then.bind(rowsPromise),
    catch:      rowsPromise.catch.bind(rowsPromise),
  };
  for (const key of ['where', 'andWhere', 'whereRaw', 'select', 'orderBy', 'limit', 'returning']) {
    chain[key].mockReturnValue(chain);
  }
  // insert().onConflict().ignore() 链：每个都返回 chain（thenable）
  chain.insert.mockReturnValue(chain);
  chain.onConflict.mockReturnValue(chain);
  chain.ignore.mockReturnValue(chain);
  return chain;
}

/**
 * 构造 db.transaction mock：
 * - db.transaction(cb) 以一个 trx 对象调用 cb
 * - trx('table') 返回可链式调用的 chain
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockTransaction(trxFactory: (table: string) => any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mockDb as any).transaction = vi.fn().mockImplementation(async (cb: (trx: any) => Promise<void>) => {
    const trx = vi.fn((table: string) => trxFactory(table));
    trx.raw = vi.fn().mockReturnValue('free_coins + 100');
    await cb(trx);
  });
}

// ── 订单 Fixture ───────────────────────────────────────────────────────────────

const pendingModuleOrder = {
  id: 'order-001',
  user_id: 'user-001',
  product_type: 'module',
  product_sku: 'module_mod-abc',
  channel: 'alipay',
  status: 'pending',
  external_order_id: null,
  metadata: JSON.stringify({ product_id: 'mod-abc', product_name: '神秘孤岛' }),
};

const pendingSubOrder = {
  id: 'order-002',
  user_id: 'user-001',
  product_type: 'sub_pro',
  product_sku: 'sub_pro_monthly',
  channel: 'wechat',
  status: 'pending',
  external_order_id: null,
  metadata: JSON.stringify({}),
};

const paidOrder = {
  ...pendingModuleOrder,
  status: 'paid',
  external_order_id: 'txn-111',
};

// ── 测试套件 ───────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(() => {
    service = new PaymentService();
    vi.clearAllMocks();
  });

  // ── handleCallback：订单不存在 ───────────────────────────────────────────────
  describe('handleCallback()', () => {
    it('订单不存在时抛出 PaymentError ORDER_NOT_FOUND', async () => {
      mockDb.mockReturnValue(makeChain(null)); // payment_orders.first() = null

      await expect(
        service.handleCallback({
          orderId: 'not-exist',
          transactionId: 'txn-x',
          callbackStatus: 'paid',
          rawPayload: {},
        }),
      ).rejects.toThrow(PaymentError);

      await expect(
        service.handleCallback({
          orderId: 'not-exist',
          transactionId: 'txn-x',
          callbackStatus: 'paid',
          rawPayload: {},
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });

    it('transaction_id 相同且 status=paid 时幂等跳过（不再发权益）', async () => {
      // 第一次：查订单；第二次：写审计日志
      const orderChain = makeChain(paidOrder);
      const auditChain = makeChain();

      let callCount = 0;
      mockDb.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? orderChain : auditChain;
      });

      const result = await service.handleCallback({
        orderId: paidOrder.id,
        transactionId: 'txn-111', // 与 external_order_id 相同
        callbackStatus: 'paid',
        rawPayload: {},
      });

      expect(result.ok).toBe(true);
      expect(result.idempotent).toBe(true);
      // 没有开启事务（不发权益）
      expect((mockDb as any).transaction).toBeUndefined();
    });

    it('paid 回调：在事务内更新订单 + 写授权 + 写审计日志', async () => {
      // db('payment_orders').where.first() = pendingModuleOrder（初次查询）
      const orderChain = makeChain(pendingModuleOrder);
      mockDb.mockReturnValue(orderChain);

      const insertCalls: string[] = [];
      const updateCalls: string[] = [];

      mockTransaction((table: string) => {
        const chain = makeChain();
        chain.insert.mockImplementation(() => {
          insertCalls.push(table);
          return chain; // 保持可链式（支持 .onConflict().ignore()）
        });
        chain.update.mockImplementation(() => {
          updateCalls.push(table);
          return Promise.resolve(1);
        });
        return chain;
      });

      const result = await service.handleCallback({
        orderId: 'order-001',
        transactionId: 'txn-new',
        callbackStatus: 'paid',
        rawPayload: { foo: 'bar' },
      });

      expect(result.ok).toBe(true);
      expect(result.idempotent).toBeUndefined();
      expect(updateCalls).toContain('payment_orders');
      expect(insertCalls).toContain('content_access_grants');
      expect(insertCalls).toContain('payment_audit_log');
    });

    it('failed 回调：更新订单 status=failed + 写审计日志', async () => {
      const orderChain = makeChain(pendingModuleOrder);
      mockDb.mockReturnValue(orderChain);

      const updateCalls: string[] = [];
      const insertCalls: string[] = [];

      mockTransaction((table: string) => {
        const chain = makeChain();
        chain.update.mockImplementation(() => { updateCalls.push(table); return Promise.resolve(1); });
        chain.insert.mockImplementation(() => { insertCalls.push(table); return Promise.resolve([1]); });
        return chain;
      });

      const result = await service.handleCallback({
        orderId: 'order-001',
        transactionId: 'txn-fail',
        callbackStatus: 'failed',
        rawPayload: {},
      });

      expect(result.ok).toBe(true);
      expect(updateCalls).toContain('payment_orders');
      // failed 不写 content_access_grants
      expect(insertCalls).not.toContain('content_access_grants');
      expect(insertCalls).toContain('payment_audit_log');
    });
  });

  // ── grantBenefits：订阅类订单 ───────────────────────────────────────────────
  describe('grantBenefits()', () => {
    it('sub_pro 订单：更新 users 订阅字段 + 写 subscription_events', async () => {
      const insertCalls: string[] = [];
      const updateCalls: string[] = [];

      const trx = vi.fn((table: string) => {
        const chain = makeChain({ subscription_type: 'free', subscription_expires_at: null });
        chain.update.mockImplementation(() => { updateCalls.push(table); return Promise.resolve(1); });
        chain.insert.mockImplementation(() => { insertCalls.push(table); return Promise.resolve([1]); });
        return chain;
      }) as any;
      trx.raw = vi.fn();

      await service.grantBenefits(trx, pendingSubOrder);

      expect(updateCalls).toContain('users');
      expect(insertCalls).toContain('subscription_events');
    });

    it('product_type 未知时抛出 UNSUPPORTED_PRODUCT_TYPE', async () => {
      const trx = vi.fn(() => makeChain()) as any;
      trx.raw = vi.fn();

      await expect(
        service.grantBenefits(trx, { ...pendingModuleOrder, product_type: 'unknown_type' }),
      ).rejects.toThrow(PaymentError);
    });

    it('module 订单缺少 product_id 时抛出错误', async () => {
      const trx = vi.fn(() => makeChain()) as any;
      trx.raw = vi.fn();

      const badOrder = {
        ...pendingModuleOrder,
        metadata: JSON.stringify({}), // 缺少 product_id
      };

      await expect(service.grantBenefits(trx, badOrder)).rejects.toThrow(/product_id missing/);
    });
  });

  // ── hasContentAccess ────────────────────────────────────────────────────────
  describe('hasContentAccess()', () => {
    it('有授权记录时返回 true', async () => {
      mockDb.mockReturnValue(
        makeChain({ id: 'grant-001', user_id: 'user-001', content_type: 'module', content_id: 'mod-abc' }),
      );
      const result = await service.hasContentAccess('user-001', 'module', 'mod-abc');
      expect(result).toBe(true);
    });

    it('无授权记录时返回 false', async () => {
      mockDb.mockReturnValue(makeChain(null));
      const result = await service.hasContentAccess('user-001', 'module', 'mod-xyz');
      expect(result).toBe(false);
    });
  });
});
