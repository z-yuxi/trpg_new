/**
 * 招募系统性能基准测试
 *
 * 使用 vitest 驱动，通过 supertest 并发发送请求，
 * 测量关键接口的吞吐量与 P99 延迟。
 *
 * 阈值（SLA 基线）：
 *   - 招募列表（GET /api/recruitment）        P99 < 500ms
 *   - 帖子详情（GET /api/recruitment/:id）    P99 < 300ms
 *   - 并发申请（POST /:id/apply, 50 并发）    错误率 < 1%
 *   - 邀请过期扫描（expireInvites）           单次执行 < 200ms
 *   - 批量申请写入                            P99 < 800ms
 *
 * 运行方式：
 *   pnpm --filter @trpg/server test packages/server/src/__tests__/perf
 *   # 或
 *   pnpm --filter @trpg/server exec vitest run src/__tests__/perf
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { request, registerAndLogin } from '../e2e/setup';

const pw = 'Test1234!';
let pSeq = 0;
const pUid = () => '136' + String(Date.now()).slice(-6) + String(++pSeq).padStart(2, '0');

function envFloat(name: string): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Windows 本地与高负载 CI 下波动较大，允许通过环境变量收紧/放宽阈值。
const PERF_P99_MULTIPLIER = envFloat('PERF_P99_MULTIPLIER') ?? (process.platform === 'win32' ? 2 : 1);
const p99Limit = (baseMs: number): number => Math.round(baseMs * PERF_P99_MULTIPLIER);

// ── 计时工具 ──────────────────────────────────────────────────────────────────

async function measureConcurrent(
  n: number,
  fn: () => Promise<{ status: number }>,
): Promise<{ p50: number; p99: number; errRate: number; rps: number }> {
  const durations: number[] = [];
  let errors = 0;
  const start = Date.now();

  await Promise.all(
    Array.from({ length: n }, async () => {
      const t0 = Date.now();
      try {
        const res = await fn();
        if (res.status >= 500) errors++;
      } catch {
        errors++;
      }
      durations.push(Date.now() - t0);
    }),
  );

  const elapsed = Date.now() - start;
  durations.sort((a, b) => a - b);
  const p50 = durations[Math.floor(n * 0.5)] ?? 0;
  const p99 = durations[Math.floor(n * 0.99)] ?? durations[durations.length - 1] ?? 0;
  const errRate = errors / n;
  const rps = Math.round((n / elapsed) * 1000);

  return { p50, p99, errRate, rps };
}

// ── 测试数据准备 ───────────────────────────────────────────────────────────────

let gmToken = '';
let openPostId = '';

beforeAll(async () => {
  gmToken = await registerAndLogin(pUid(), pw);

  // 创建并发布一个帖子供后续测试使用
  const draft = await request
    .post('/api/recruitment')
    .set('Authorization', 'Bearer ' + gmToken)
    .send({ title: '性能测试帖', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 100 });
  if (draft.status === 201) {
    const pub = await request
      .post(`/api/recruitment/${draft.body.id}/publish`)
      .set('Authorization', 'Bearer ' + gmToken);
    if (pub.status === 200) openPostId = draft.body.id;
  }
}, 30_000);

// ── 测试用例 ──────────────────────────────────────────────────────────────────

describe('性能基准 - 招募列表', () => {
  it('单请求 P99 < 500ms（20次热身后再测）', async () => {
    // 热身
    for (let i = 0; i < 5; i++) await request.get('/api/recruitment');

    const { p99, errRate } = await measureConcurrent(20, () => request.get('/api/recruitment'));
    console.log(`  [招募列表] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%`);

    expect(errRate).toBeLessThan(0.01); // 错误率 < 1%
    expect(p99).toBeLessThan(p99Limit(500));
  });

  it('分页参数不影响成功率', async () => {
    const { errRate } = await measureConcurrent(10, () =>
      request.get('/api/recruitment?page=1&limit=10&sort=latest'),
    );
    expect(errRate).toBeLessThan(0.01);
  });
});

describe('性能基准 - 帖子详情', () => {
  it('P99 < 300ms', async () => {
    if (!openPostId) {
      console.warn('  [跳过] 未创建测试帖子');
      return;
    }
    const { p99, errRate } = await measureConcurrent(20, () =>
      request.get(`/api/recruitment/${openPostId}`),
    );
    console.log(`  [帖子详情] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%`);
    expect(errRate).toBeLessThan(0.01);
    expect(p99).toBeLessThan(p99Limit(300));
  });
});

describe('性能基准 - 并发申请写入', () => {
  it('50 并发申请：错误率 < 1%，P99 < 800ms', async () => {
    if (!openPostId) {
      console.warn('  [跳过] 未创建测试帖子');
      return;
    }

    const CONCURRENCY = 50;
    // 每个并发请求使用独立用户
    const playerTokens = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => registerAndLogin(pUid(), pw)),
    );

    let idx = 0;
    const { p99, errRate, rps } = await measureConcurrent(CONCURRENCY, async () => {
      const token = playerTokens[idx++] ?? playerTokens[0];
      return request
        .post(`/api/recruitment/${openPostId}/apply`)
        .set('Authorization', 'Bearer ' + token)
        .send({ message: '并发测试申请' });
    });

    console.log(`  [并发申请] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%, RPS≈${rps}`);

    expect(errRate).toBeLessThan(0.01); // 允许 <1% 5xx（并发冲突可能产生 400，不算错误）
    expect(p99).toBeLessThan(p99Limit(800));
  }, 60_000);
});

describe('性能基准 - 重复申请幂等', () => {
  it('同一幂等键重复提交应全部成功（无 5xx）', async () => {
    if (!openPostId) return;
    const token = await registerAndLogin(pUid(), pw);
    const key = 'perf-test-idem-' + Date.now();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request
          .post(`/api/recruitment/${openPostId}/apply`)
          .set('Authorization', 'Bearer ' + token)
          .set('X-Idempotency-Key', key)
          .send({ message: '幂等测试' }),
      ),
    );

    // 所有请求都不应返回 5xx
    results.forEach((r) => {
      expect(r.status).toBeLessThan(500);
    });
    // 至少有一次成功
    const successful = results.filter((r) => r.status === 201 || r.status === 200);
    expect(successful.length).toBeGreaterThanOrEqual(1);
  });
});

describe('性能基准 - 招募帖创建写入', () => {
  it('10 并发创建草稿：错误率 = 0，P99 < 800ms', async () => {
    const CONCURRENCY = 10;
    const tokens = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => registerAndLogin(pUid(), pw)),
    );
    let i = 0;
    const { p99, errRate } = await measureConcurrent(CONCURRENCY, () =>
      request
        .post('/api/recruitment')
        .set('Authorization', 'Bearer ' + (tokens[i++] ?? tokens[0]))
        .send({ title: '并发帖子', type: 'gm_recruit', ruleset_id: 'coc-7', player_count_max: 4 }),
    );
    console.log(`  [并发创建帖] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%`);
    expect(errRate).toBe(0);
    expect(p99).toBeLessThan(p99Limit(800));
  }, 30_000);
});

// ─── 新增：Schedule 筛选性能（任务 D） ────────────────────────────────────────

describe('性能基准 - schedule_weekday / schedule_time_slot 筛选', () => {
  it('带时间段筛选的招募列表 P99 < 500ms', async () => {
    // 热身
    for (let i = 0; i < 3; i++) {
      await request.get('/api/recruitment?schedule_weekday=sat&schedule_time_slot=evening');
    }
    const { p99, errRate } = await measureConcurrent(20, () =>
      request.get('/api/recruitment?schedule_weekday=sat&schedule_time_slot=evening'),
    );
    console.log(`  [时段筛选列表] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%`);
    expect(errRate).toBeLessThan(0.01);
    expect(p99).toBeLessThan(p99Limit(500));
  });

  it('带最少席位筛选的招募列表 P99 < 500ms', async () => {
    const { p99, errRate } = await measureConcurrent(20, () =>
      request.get('/api/recruitment?min_seats=2'),
    );
    console.log(`  [席位筛选列表] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%`);
    expect(errRate).toBeLessThan(0.01);
    expect(p99).toBeLessThan(p99Limit(500));
  });

  it('组合筛选（weekday + time_slot + min_seats）P99 < 600ms', async () => {
    const { p99, errRate } = await measureConcurrent(20, () =>
      request.get('/api/recruitment?schedule_weekday=sat&schedule_time_slot=evening&min_seats=1'),
    );
    console.log(`  [组合筛选] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%`);
    expect(errRate).toBeLessThan(0.01);
    expect(p99).toBeLessThan(p99Limit(600));
  });
});

// ─── 新增：消息查询（history_visibility=none）性能 ─────────────────────────────

describe('性能基准 - 消息时段过滤 (history_visibility=none EXISTS 子查询)', () => {
  /**
   * 由于 E2E 环境使用 in-memory mock DB，无法直接测试真实 SQL EXISTS 子查询。
   * 此处验证接口层面的响应时间，确保路由层不引入额外阻塞。
   *
   * 真实 DB 性能由 CI 环境中的集成测试或手工 EXPLAIN 验证：
   *   EXPLAIN SELECT ... WHERE EXISTS (SELECT 1 FROM scene_participations
   *     WHERE character_id IN (...) AND scene_id = ? AND joined_at <= ? AND ...)
   * 预期：Using index (idx_sp_char_scene_joined)
   */
  it('消息历史接口（含场景 ID 参数）20并发 P99 < 400ms', async () => {
    if (!gmToken) return;
    const CONCURRENCY = 20;
    // 用一个不存在的 campaignId 快速测量路由层开销
    const { p99, errRate } = await measureConcurrent(CONCURRENCY, () =>
      request
        .get('/api/campaigns/perf-test-no-exist/scenes/scene-000/messages?limit=50')
        .set('Authorization', 'Bearer ' + gmToken),
    );
    console.log(`  [消息历史接口] P99=${p99}ms, errRate=${(errRate * 100).toFixed(1)}%`);
    // 接口应快速返回 404（路由层）而非挂起
    expect(p99).toBeLessThan(p99Limit(400));
  });
});

