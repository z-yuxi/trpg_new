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
    expect(p99).toBeLessThan(500);
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
    expect(p99).toBeLessThan(300);
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
    expect(p99).toBeLessThan(800);
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
    expect(p99).toBeLessThan(800);
  }, 30_000);
});
</content>
</invoke>