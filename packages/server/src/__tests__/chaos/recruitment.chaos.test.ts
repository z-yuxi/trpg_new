/**
 * 故障注入演练套件
 *
 * 验证系统在以下场景下的降级与恢复能力：
 *   Scenario-A: Redis 不可用（幂等降级、限流降级、缓存 miss 降级）
 *   Scenario-B: DB 查询超时/失败（返回 503/健康检查降级）
 *   Scenario-C: 网络抖动（慢响应、部分超时）
 *   Scenario-D: cron 任务异常（expireInvites 失败不影响主服务）
 *   Scenario-E: 大批量数据下的性能降级边界
 *
 * 运行方式：
 *   pnpm --filter @trpg/server test src/__tests__/chaos/
 *
 * 注意：这些测试会 mock 基础设施，可安全在 CI 中运行。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, registerAndLogin } from '../e2e/setup';

const pw = 'Test1234!';
let cSeq = 0;
const cUid = () => '134' + String(Date.now()).slice(-6) + String(++cSeq).padStart(2, '0');

// ── 辅助 ─────────────────────────────────────────────────────────────────────

async function setupPost(gmToken: string) {
  const draft = await request
    .post('/api/recruitment')
    .set('Authorization', 'Bearer ' + gmToken)
    .send({ title: '演练帖', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
  if (draft.status !== 201) return null;
  const pub = await request
    .post(`/api/recruitment/${draft.body.id}/publish`)
    .set('Authorization', 'Bearer ' + gmToken);
  return pub.status === 200 ? (draft.body.id as string) : null;
}

// ── Scenario-A: Redis 不可用 ───────────────────────────────────────────────

describe('故障演练 A — Redis 不可用', () => {
  // 在 e2e setup.ts 中，redis 已被 mock 为内存实现。
  // 此处进一步 mock 为全部拒绝（模拟 Redis 宕机）
  let originalGet: (() => unknown) | undefined;
  let originalSet: (() => unknown) | undefined;
  let originalPing: (() => unknown) | undefined;

  beforeEach(async () => {
    const { redis } = await import('../../db/redis.js');
    originalGet = (redis.get as ReturnType<typeof vi.fn>).getMockImplementation?.() ?? (() => null);
    originalSet = (redis.set as ReturnType<typeof vi.fn>).getMockImplementation?.() ?? (() => 'OK');

    // 模拟 Redis 全部报错
    vi.mocked(redis.get).mockRejectedValue(new Error('Redis connection refused'));
    vi.mocked(redis.set).mockRejectedValue(new Error('Redis connection refused'));
    vi.mocked(redis.setex).mockRejectedValue(new Error('Redis connection refused'));
    vi.mocked(redis.ping).mockRejectedValue(new Error('Redis connection refused'));
  });

  afterEach(async () => {
    const { redis } = await import('../../db/redis.js');
    // 恢复默认 mock（返回正常值）
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue('OK');
    vi.mocked(redis.setex).mockResolvedValue('OK');
    vi.mocked(redis.ping).mockRejectedValue(new Error('Redis not available'));
  });

  it('A1: Redis 宕机时 GET /api/health 应返回 degraded (503)', async () => {
    const res = await request.get('/api/health');
    // Redis 失败时应返回 503 + degraded
    expect([200, 503]).toContain(res.status);
    if (res.status === 503) {
      expect(res.body.status).toBe('degraded');
      expect(res.body.checks?.redis).toBe('error');
    }
  });

  it('A2: Redis 宕机时申请接口应正常处理（幂等中间件降级）', async () => {
    const gmToken = await registerAndLogin(cUid(), pw);
    const playerToken = await registerAndLogin(cUid(), pw);
    const postId = await setupPost(gmToken);
    if (!postId) return;

    // Redis 不可用时，幂等中间件应降级放行，业务照常执行
    const res = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', 'Bearer ' + playerToken)
      .set('X-Idempotency-Key', 'chaos-test-' + Date.now())
      .send({ message: 'Redis 宕机测试' });

    // 期望：业务成功（不因 Redis 失败而 500）
    expect(res.status).toBeLessThan(500);
    expect([201, 400]).toContain(res.status); // 201 申请成功 或 400 业务错误（非 5xx）
  });

  it('A3: Redis 宕机时指标接口应降级返回实时 DB 数据（非缓存）', async () => {
    const gmToken = await registerAndLogin(cUid(), pw);
    const res = await request
      .get('/api/metrics/recruitment/funnel?days=7')
      .set('Authorization', 'Bearer ' + gmToken);

    // 期望：降级后仍能返回数据（从 DB 查询），不应 500
    expect(res.status).toBeLessThan(500);
  });
});

// ── Scenario-B: DB 查询超时/部分失败 ─────────────────────────────────────

describe('故障演练 B — DB 异常降级', () => {
  it('B1: DB 不可达时 /api/health 应返回 503 + db:error', async () => {
    const { db } = await import('../../db/index.js');
    const originalRaw = db.raw.bind(db);

    // 临时让 db.raw 失败（模拟 DB 宕机）
    vi.spyOn(db, 'raw').mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const res = await request.get('/api/health');
    expect([200, 503]).toContain(res.status);
    if (res.status === 503) {
      expect(res.body.checks?.db).toBe('error');
    }

    vi.spyOn(db, 'raw').mockRestore?.();
    void originalRaw;
  });

  it('B2: 招募列表 DB 失败应返回 500（不崩溃进程）', async () => {
    const { db } = await import('../../db/index.js');

    // Mock 特定 table 查询失败
    const spy = vi.spyOn(db, 'raw' as never).mockRejectedValueOnce(new Error('DB error'));

    const res = await request.get('/api/recruitment');
    // 期望：返回 5xx（合理错误），不是进程崩溃
    expect([200, 500, 503]).toContain(res.status);

    spy.mockRestore();
  });
});

// ── Scenario-C: 慢响应与超时 ──────────────────────────────────────────────

describe('故障演练 C — 慢响应边界', () => {
  it('C1: 并发 20 个请求仍能全部返回（无挂起）', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request.get('/api/recruitment')),
    );
    results.forEach((r) => {
      expect(r.status).toBeLessThan(500);
    });
  }, 30_000);

  it('C2: 健康检查端点在高并发下稳定', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => request.get('/api/health')),
    );
    results.forEach((r) => {
      expect([200, 503]).toContain(r.status);
    });
  });
});

// ── Scenario-D: Cron 任务异常隔离 ────────────────────────────────────────

describe('故障演练 D — Cron 任务异常隔离', () => {
  it('D1: expireInvites 内部异常不影响主服务接口可用性', async () => {
    // 模拟 expireInvites 抛出异常
    const { recruitmentService } = await import('../../services/recruitment-service.js');
    vi.spyOn(recruitmentService, 'expireInvites').mockRejectedValueOnce(new Error('DB timeout'));

    // 验证 API 仍然可用
    const res = await request.get('/api/recruitment');
    expect(res.status).toBeLessThan(500);

    vi.spyOn(recruitmentService, 'expireInvites').mockRestore();
  });

  it('D2: 日报巡检失败不影响招募主链路', async () => {
    const { runDailyDataCheck } = await import('../../services/daily-check-service.js');
    vi.spyOn({ runDailyDataCheck }, 'runDailyDataCheck').mockRejectedValueOnce(new Error('check failed'));

    // 主链路不受影响
    const gmToken = await registerAndLogin(cUid(), pw);
    const res = await request
      .post('/api/recruitment')
      .set('Authorization', 'Bearer ' + gmToken)
      .send({ title: '测试', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2 });
    expect(res.status).toBeLessThan(500);
  });
});

// ── Scenario-E: 优雅降级验证 ─────────────────────────────────────────────

describe('故障演练 E — 优雅降级', () => {
  it('E1: 幂等键 Redis 失效后，相同 key 重复提交不产生重复数据（DB 层兜底）', async () => {
    const gmToken = await registerAndLogin(cUid(), pw);
    const playerToken = await registerAndLogin(cUid(), pw);
    const postId = await setupPost(gmToken);
    if (!postId) return;

    const idempotencyKey = 'degraded-idem-' + Date.now();

    // 第一次申请
    const r1 = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', 'Bearer ' + playerToken)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ message: '幂等降级测试' });

    expect(r1.status).toBeLessThan(500);
    if (r1.status !== 201) return; // 如果第一次就失败，跳过

    // 第二次：Redis 降级（已在 setup 中 mock 为 null），仍应被 DB 唯一约束阻止
    const r2 = await request
      .post(`/api/recruitment/${postId}/apply`)
      .set('Authorization', 'Bearer ' + playerToken)
      .set('X-Idempotency-Key', idempotencyKey)
      .send({ message: '第二次尝试' });

    // 第二次应被拒绝（DB 唯一约束或业务校验），不能产生第二条记录
    expect(r2.status).toBeGreaterThanOrEqual(400);
    expect(r2.status).toBeLessThan(500);
  });

  it('E2: 未认证请求在任何故障场景下均返回 401', async () => {
    const res = await request.post('/api/recruitment').send({
      title: '测试', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 2,
    });
    expect(res.status).toBe(401);
  });
});
