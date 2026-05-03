import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock 会被 vitest 自动提升到文件顶部
vi.mock('../db', () => ({
  db: Object.assign(vi.fn(), {
    fn: { now: vi.fn().mockReturnValue('CURRENT_TIMESTAMP') },
    transaction: vi.fn(),
  }),
}));
vi.mock('../services/campaign-service', () => ({
  campaignService: {
    create: vi.fn(),
    listScenes: vi.fn(),
  },
}));
vi.mock('../db/redis', () => ({
  redis: { publish: vi.fn() },
}));

import { db } from '../db';
import { RecruitmentService } from '../services/recruitment-service';

const mockDb = vi.mocked(db);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(firstValue: unknown = null, resolveRows: unknown[] = []): any {
  const rowsPromise = Promise.resolve(resolveRows);
  const chain: Record<string, any> = {
    where:       vi.fn(),
    andWhere:    vi.fn(),
    whereIn:     vi.fn(),
    whereNot:    vi.fn(),
    whereNotNull: vi.fn(),
    leftJoin:    vi.fn(),
    select:      vi.fn(),
    orderBy:     vi.fn(),
    offset:      vi.fn(),
    limit:       vi.fn(),
    max:         vi.fn(),
    count:       vi.fn(),
    forUpdate:   vi.fn(),
    insert:      vi.fn().mockResolvedValue([1]),
    update:      vi.fn().mockResolvedValue(1),
    decrement:   vi.fn().mockResolvedValue(1),
    first:       vi.fn().mockResolvedValue(firstValue),
    then:        rowsPromise.then.bind(rowsPromise),
    catch:       rowsPromise.catch.bind(rowsPromise),
  };
  for (const key of [
    'where', 'andWhere', 'whereIn', 'whereNot', 'whereNotNull',
    'leftJoin', 'select', 'orderBy', 'offset', 'limit',
    'max', 'count', 'forUpdate',
  ]) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

/** 构造 recruitment_posts 行 */
function makePost(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'post-001',
    poster_id: 'gm-001',
    title: '测试招募',
    type: 'gm_recruit',
    status: 'open',
    ruleset_id: 'rs-001',
    player_count_max: 2,
    player_count_joined: 0,
    campaign_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

/** 构造 recruitment_applications 行 */
function makeApp(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'app-001',
    post_id: 'post-001',
    applicant_user_id: 'player-001',
    character_id: null,
    message: '求带',
    status: 'pending',
    reject_reason: null,
    invited_expires_at: null,
    waiting_position: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('RecruitmentService 状态机', () => {
  let service: RecruitmentService;

  beforeEach(() => {
    service = new RecruitmentService();
    vi.clearAllMocks();
    // 让 transaction 执行回调，并将 mockDb 本身作为 trx 传入
    (mockDb as any).transaction.mockImplementation(async (cb: (trx: typeof mockDb) => Promise<unknown>) => cb(mockDb));
  });

  // ── createApplication ─────────────────────────────────────────
  describe('createApplication()', () => {
    it('open 帖 — 正常申请状态为 pending', async () => {
      const post = makePost({ status: 'open' });
      const appRow = makeApp({ status: 'pending' });
      const chain = makeChain(post);
      // findById 已被 spyOn 拦截，db.first 的第一次调用是检查重复申请
      chain.first
        .mockResolvedValueOnce(null)    // 检查重复申请
        .mockResolvedValueOnce(appRow); // 返回新建申请

      mockDb.mockReturnValue(chain);
      vi.spyOn(service as any, 'findById').mockResolvedValue(post);

      const result = await service.createApplication({
        post_id: 'post-001',
        applicant_user_id: 'player-001',
        message: '求带',
      });

      expect(result.status).toBe('pending');
    });

    it('full 帖 — 申请自动进候补队列', async () => {
      const post = makePost({ status: 'full' });
      const appRow = makeApp({ status: 'waiting', waiting_position: 1 });
      const chain = makeChain(post);
      // findById 已被 spyOn 拦截，db.first 调用顺序：
      //   1. 检查重复申请 → null
      //   2. nextWaitingPosition: MAX 查询 → null（队列为空，position = 1）
      //   3. 返回新建申请 → appRow
      chain.first
        .mockResolvedValueOnce(null)    // 检查重复
        .mockResolvedValueOnce(null)    // nextWaitingPosition: max → null
        .mockResolvedValueOnce(appRow); // 返回

      mockDb.mockReturnValue(chain);
      vi.spyOn(service as any, 'findById').mockResolvedValue(post);

      const result = await service.createApplication({
        post_id: 'post-001',
        applicant_user_id: 'player-002',
        message: '候补',
      });

      expect(result.status).toBe('waiting');
    });

    it('已有申请时抛出错误', async () => {
      const post = makePost({ status: 'open' });
      const existedApp = makeApp();
      const chain = makeChain(post);
      chain.first
        .mockResolvedValueOnce(existedApp); // 重复申请检查

      mockDb.mockReturnValue(chain);
      vi.spyOn(service as any, 'findById').mockResolvedValue(post);

      await expect(
        service.createApplication({ post_id: 'post-001', applicant_user_id: 'player-001', message: '再来' }),
      ).rejects.toThrow('你已提交过申请');
    });
  });

  // ── reviewApplication ─────────────────────────────────────────
  describe('reviewApplication()', () => {
    it('approve — 申请变 invited，写入到期时间', async () => {
      const post = makePost();
      const app = makeApp({ status: 'pending' });
      const updatedApp = makeApp({ status: 'invited', invited_expires_at: new Date(Date.now() + 86_400_000) });
      const chain = makeChain(app);
      chain.first
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(updatedApp);

      mockDb.mockReturnValue(chain);
      vi.spyOn(service as any, 'findById').mockResolvedValue(post);

      const result = await service.reviewApplication({
        post_id: 'post-001',
        application_id: 'app-001',
        owner_id: 'gm-001',
        action: 'approve',
      });

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'invited' }),
      );
      expect(result.status).toBe('invited');
    });

    it('reject — 申请变 rejected，存储拒绝原因', async () => {
      const post = makePost();
      const app = makeApp({ status: 'pending' });
      const updatedApp = makeApp({ status: 'rejected', reject_reason: '不合适' });
      const chain = makeChain(app);
      chain.first
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(null)        // promoteNextWaiting: post → null → early return
        .mockResolvedValueOnce(updatedApp); // 最终返回

      mockDb.mockReturnValue(chain);
      vi.spyOn(service as any, 'findById').mockResolvedValue(post);

      const result = await service.reviewApplication({
        post_id: 'post-001',
        application_id: 'app-001',
        owner_id: 'gm-001',
        action: 'reject',
        reject_reason: '不合适',
      });

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected', reject_reason: '不合适' }),
      );
      expect(result.status).toBe('rejected');
    });
  });

  // ── confirmApplication ────────────────────────────────────────
  describe('confirmApplication()', () => {
    it('invited → confirmed，到期前确认成功', async () => {
      const futureExpiry = new Date(Date.now() + 3_600_000);
      const app = makeApp({ status: 'invited', invited_expires_at: futureExpiry });
      const confirmedApp = makeApp({ status: 'confirmed', invited_expires_at: null });
      const post = makePost({ player_count_max: 2 });
      const chain = makeChain(app);
      chain.first
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(post)           // recalculate: 帖查询
        .mockResolvedValueOnce({ total: 1 })   // recalculate: count confirmed
        .mockResolvedValueOnce(confirmedApp);  // 最终返回

      mockDb.mockReturnValue(chain);

      const result = await service.confirmApplication({
        application_id: 'app-001',
        applicant_user_id: 'player-001',
      });

      expect(result.status).toBe('confirmed');
    });

    it('到期后确认抛出错误并置为 rejected', async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      const app = makeApp({ status: 'invited', invited_expires_at: pastExpiry });
      const chain = makeChain(app);
      chain.first
        .mockResolvedValueOnce(app)
        .mockResolvedValueOnce(null); // promoteNextWaiting

      mockDb.mockReturnValue(chain);

      await expect(
        service.confirmApplication({ application_id: 'app-001', applicant_user_id: 'player-001' }),
      ).rejects.toThrow('邀请已过期');

      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });
  });

  // ── expireInvites ─────────────────────────────────────────────
  describe('expireInvites()', () => {
    it('无过期邀请时返回 0', async () => {
      const chain = makeChain(null, []);
      mockDb.mockReturnValue(chain);

      const count = await service.expireInvites();

      expect(count).toBe(0);
      expect(chain.update).not.toHaveBeenCalled();
    });

    it('有过期邀请时批量标 rejected 并提升候补', async () => {
      const expiredApps = [
        { id: 'app-001', post_id: 'post-001' },
        { id: 'app-002', post_id: 'post-001' },
      ];
      const chain = makeChain(null, expiredApps);
      chain.first.mockResolvedValueOnce(null); // promoteNextWaiting: no waiting

      mockDb.mockReturnValue(chain);

      const count = await service.expireInvites();

      expect(count).toBe(2);
      expect(chain.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'rejected' }),
      );
    });
  });
});
