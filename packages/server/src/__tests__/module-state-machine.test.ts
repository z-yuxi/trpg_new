import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock 会被 vitest 自动提升到文件顶部
vi.mock('../db', () => ({ db: vi.fn() }));

import { db } from '../db';
import { ModuleService } from '../services/module-service';

const mockDb = vi.mocked(db);

/**
 * 构造 Knex 链式 Builder mock
 * @param firstValue  .first() 的解析值
 * @param resolveRows 直接 await 链时的解析值（用于 for-of 查询）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(firstValue: unknown = null, resolveRows: unknown[] = []): any {
  const rowsPromise = Promise.resolve(resolveRows);
  const chain: Record<string, any> = {
    where:    vi.fn(),
    andWhere: vi.fn(),
    leftJoin: vi.fn(),
    select:   vi.fn(),
    orderBy:  vi.fn(),
    offset:   vi.fn(),
    limit:    vi.fn(),
    first:    vi.fn().mockResolvedValue(firstValue),
    update:   vi.fn().mockResolvedValue(1),
    insert:   vi.fn().mockResolvedValue([1]),
    // 让链本身可被 await（Knex 的行为）
    then:     rowsPromise.then.bind(rowsPromise),
    catch:    rowsPromise.catch.bind(rowsPromise),
  };
  for (const key of ['where', 'andWhere', 'leftJoin', 'select', 'orderBy', 'offset', 'limit']) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

describe('ModuleService 状态机', () => {
  let service: ModuleService;

  beforeEach(() => {
    service = new ModuleService();
    vi.clearAllMocks();
  });

  // ── submitForReview ───────────────────────────────────────────
  describe('submitForReview()', () => {
    it('模组不存在或状态不是 draft 时返回 null', async () => {
      mockDb.mockReturnValue(makeChain(null));

      const result = await service.submitForReview('not-exist', 'user-001');

      expect(result).toBeNull();
    });

    it('非拥有者调用时返回 null（DB 匹配失败）', async () => {
      // Knex where({ id, author_id, status: 'draft' }) 匹配不到时返回 null
      mockDb.mockReturnValue(makeChain(null));

      const result = await service.submitForReview('mod-001', 'wrong-user');

      expect(result).toBeNull();
    });

    it('draft 模组提交后执行两次 status update（reviewing + public_notice）', async () => {
      const draftModule = { id: 'mod-001', author_id: 'user-001', status: 'draft', content: '{}' };
      const reviewingModule = { ...draftModule, status: 'reviewing' };

      // 按调用顺序配置：
      // 1. draft 检查  2. update reviewing  3. log insert
      // 4. startPublicNotice: first  5. update public_notice  6. log insert
      // 7. getById（spy 拦截，不需要真实链）
      const chain = makeChain();
      chain.first
        .mockResolvedValueOnce(draftModule)    // submitForReview 检查
        .mockResolvedValueOnce(reviewingModule); // startPublicNotice 检查

      vi.spyOn(service, 'getById').mockResolvedValue({
        ...draftModule, status: 'public_notice',
      } as any);

      mockDb.mockReturnValue(chain);

      const result = await service.submitForReview('mod-001', 'user-001');

      // 两次 update：reviewing + public_notice
      expect(chain.update).toHaveBeenCalledTimes(2);
      expect(chain.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: 'reviewing' }));
      expect(chain.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: 'public_notice' }));

      expect(service.getById).toHaveBeenCalledWith('mod-001');
      expect(result?.status).toBe('public_notice');
    });
  });

  // ── withdraw ─────────────────────────────────────────────────
  describe('withdraw()', () => {
    it('模组不存在时返回 null', async () => {
      mockDb.mockReturnValue(makeChain(null));

      const result = await service.withdraw('not-exist', 'user-001');

      expect(result).toBeNull();
    });

    it('status=draft 时无法撤回（返回 null）', async () => {
      mockDb.mockReturnValue(makeChain({ id: 'mod-001', author_id: 'user-001', status: 'draft' }));

      const result = await service.withdraw('mod-001', 'user-001');

      expect(result).toBeNull();
    });

    it('status=public 时无法撤回（返回 null）', async () => {
      mockDb.mockReturnValue(makeChain({ id: 'mod-001', author_id: 'user-001', status: 'public' }));

      const result = await service.withdraw('mod-001', 'user-001');

      expect(result).toBeNull();
    });

    it('reviewing 状态可以撤回到 draft', async () => {
      const reviewingModule = { id: 'mod-001', author_id: 'user-001', status: 'reviewing' };
      const chain = makeChain(reviewingModule);

      vi.spyOn(service, 'getById').mockResolvedValue({
        ...reviewingModule, status: 'draft',
      } as any);
      mockDb.mockReturnValue(chain);

      const result = await service.withdraw('mod-001', 'user-001');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
      expect(result?.status).toBe('draft');
    });

    it('public_notice 状态可以撤回到 draft', async () => {
      const pnModule = { id: 'mod-002', author_id: 'user-001', status: 'public_notice' };
      const chain = makeChain(pnModule);

      vi.spyOn(service, 'getById').mockResolvedValue({
        ...pnModule, status: 'draft',
      } as any);
      mockDb.mockReturnValue(chain);

      const result = await service.withdraw('mod-002', 'user-001');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'draft',
        review_snapshot: null,
        public_notice_end_at: null,
      }));
      expect(result?.status).toBe('draft');
    });
  });

  // ── completeExpiredPublicNotices ──────────────────────────────
  describe('completeExpiredPublicNotices()', () => {
    it('无过期公示时不调用 completePublicNotice', async () => {
      const spy = vi.spyOn(service, 'completePublicNotice').mockResolvedValue();
      // 链直接被 await 时返回空数组
      mockDb.mockReturnValue(makeChain(null, []));

      await service.completeExpiredPublicNotices();

      expect(spy).not.toHaveBeenCalled();
    });

    it('有 N 个过期公示则调用 completePublicNotice N 次', async () => {
      const spy = vi.spyOn(service, 'completePublicNotice').mockResolvedValue();
      const expired = [
        { id: 'mod-A', status: 'public_notice' },
        { id: 'mod-B', status: 'public_notice' },
        { id: 'mod-C', status: 'public_notice' },
      ];
      mockDb.mockReturnValue(makeChain(null, expired));

      await service.completeExpiredPublicNotices();

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledWith('mod-A');
      expect(spy).toHaveBeenCalledWith('mod-B');
      expect(spy).toHaveBeenCalledWith('mod-C');
    });
  });

  // ── completePublicNotice ──────────────────────────────────────
  describe('completePublicNotice()', () => {
    it('模组不存在时静默退出', async () => {
      const chain = makeChain(null);
      mockDb.mockReturnValue(chain);

      await service.completePublicNotice('not-exist');

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('status 不是 public_notice 时静默退出', async () => {
      const chain = makeChain({ id: 'mod-001', status: 'draft' });
      mockDb.mockReturnValue(chain);

      await service.completePublicNotice('mod-001');

      expect(chain.update).not.toHaveBeenCalled();
    });

    it('public_notice 模组转为 public 并写入日志', async () => {
      const pnModule = { id: 'mod-001', status: 'public_notice' };
      const chain = makeChain(pnModule);
      mockDb.mockReturnValue(chain);

      await service.completePublicNotice('mod-001');

      expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'public' }));
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        from_status: 'public_notice',
        to_status: 'public',
      }));
    });
  });
});


