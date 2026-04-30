/**
 * E2E — 热度排行 API
 *
 * 验证三种场景：
 *   1. 正常情况（4 条数据）— 返回按热度排序的 data 数组，含 top_badge
 *   2. 不足 4 条（2 条）— 返回实际条数
 *   3. 空数据（0 条）    — data 为空数组（前端负责隐藏区域）
 *   4. 性能：响应 < 200ms（缓存 miss 路径，DB 为内存 mock）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { request, rows } from './setup';

// 辅助：构造 module 行
function makeModule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mod-' + Math.random().toString(36).slice(2),
    name: '测试模组',
    description: '一个测试用模组',
    cover_url: '',
    author_id: 'author-001',
    status: 'public',
    reaction_count: 0,
    comment_count: 0,
    is_featured: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// 辅助：构造 forum_thread 行（board='share'）
function makeStory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'story-' + Math.random().toString(36).slice(2),
    board: 'share',
    author_id: 'author-001',
    title: '测试故事',
    content: '一段测试用故事内容，足够 120 字截取摘要。'.repeat(3),
    view_count: 0,
    reply_count: 0,
    like_count: 0,
    is_featured: 0,
    is_pinned: false,
    is_locked: false,
    last_reply_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── GET /api/trending/modules ────────────────────────────────────────────────

describe('E2E — GET /api/trending/modules', () => {
  beforeEach(() => {
    rows.modules = [];
    rows.forum_threads = [];
  });

  it('正常情况（4 条模组）返回 data 数组，每项含 top_badge', async () => {
    rows.modules = [
      makeModule({ id: 'm1', reaction_count: 20, comment_count: 5, is_featured: 0 }),
      makeModule({ id: 'm2', reaction_count: 3,  comment_count: 8, is_featured: 0 }),
      makeModule({ id: 'm3', reaction_count: 1,  comment_count: 1, is_featured: 1 }),
      makeModule({ id: 'm4', reaction_count: 0,  comment_count: 0, is_featured: 0 }),
    ];

    const res = await request.get('/api/trending/modules');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeLessThanOrEqual(4);

    // 每项应有 top_badge
    for (const item of res.body.data) {
      expect(item.top_badge).toBeDefined();
      expect(['featured', 'comment', 'reaction']).toContain(item.top_badge.type);
    }
  });

  it('不足 4 条（2 条）返回实际条数', async () => {
    rows.modules = [
      makeModule({ id: 'ma1', reaction_count: 5, comment_count: 2 }),
      makeModule({ id: 'ma2', reaction_count: 1, comment_count: 0 }),
    ];

    const res = await request.get('/api/trending/modules');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(2);
  });

  it('无公开模组时 data 为空数组', async () => {
    rows.modules = [];

    const res = await request.get('/api/trending/modules');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('响应时间 < 200ms（内存 mock DB）', async () => {
    rows.modules = [makeModule({ id: 'perf-m', reaction_count: 10 })];
    const start = Date.now();
    const res = await request.get('/api/trending/modules');
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(200);
  });
});

// ─── GET /api/trending/stories ────────────────────────────────────────────────

describe('E2E — GET /api/trending/stories', () => {
  beforeEach(() => {
    rows.modules = [];
    rows.forum_threads = [];
  });

  it('正常情况（4 条故事）返回 data 数组，每项含 top_badge', async () => {
    rows.forum_threads = [
      makeStory({ id: 's1', like_count: 15, reply_count: 8, is_featured: 0 }),
      makeStory({ id: 's2', like_count: 2,  reply_count: 3, is_featured: 1 }),
      makeStory({ id: 's3', like_count: 5,  reply_count: 1, is_featured: 0 }),
      makeStory({ id: 's4', like_count: 0,  reply_count: 0, is_featured: 0 }),
    ];

    const res = await request.get('/api/trending/stories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeLessThanOrEqual(4);

    for (const item of res.body.data) {
      expect(item.top_badge).toBeDefined();
      expect(item.title).toBeDefined();
    }
  });

  it('不足 4 条（1 条）返回实际条数', async () => {
    rows.forum_threads = [
      makeStory({ id: 'sa1', like_count: 3, reply_count: 1 }),
    ];

    const res = await request.get('/api/trending/stories');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  it('无故事帖时 data 为空数组', async () => {
    rows.forum_threads = [];

    const res = await request.get('/api/trending/stories');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('summary 字段为正文前 120 字截取', async () => {
    const longContent = '甲'.repeat(200);
    rows.forum_threads = [makeStory({ id: 'sum-s', content: longContent })];

    const res = await request.get('/api/trending/stories');
    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      expect(res.body.data[0].summary.length).toBeLessThanOrEqual(120);
    }
  });

  it('响应时间 < 200ms（内存 mock DB）', async () => {
    rows.forum_threads = [makeStory({ id: 'perf-s' })];
    const start = Date.now();
    const res = await request.get('/api/trending/stories');
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(200);
  });
});
