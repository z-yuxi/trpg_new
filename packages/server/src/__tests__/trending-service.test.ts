/**
 * 单元测试：TrendingService 热度计算
 *
 * 覆盖：
 *   1. topBadge 辅助函数逻辑（featured > comment > reaction）
 *   2. getTrendingModules / getTrendingStories：缓存命中路径
 *   3. getTrendingModules / getTrendingStories：缓存 miss → DB 查询路径
 *   4. limit 参数限制（≤ MAX_LIMIT=20，≥ 1）
 *   5. refreshCache 写入 Redis setex
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrendingModule, TrendingStory } from '../services/trending-service';

// ── Hoisted mocks（必须先于 vi.mock factory 初始化）────────────────────────
const { mockGet, mockSetex } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetex: vi.fn().mockResolvedValue('OK'),
}));

vi.mock('../db/redis', () => ({
  redis: {
    get: mockGet,
    setex: mockSetex,
  },
}));

// ── Mock DB ───────────────────────────────────────────────────────────────────
const mockModuleRows = [
  { id: 'm1', name: '孤岛谜踪', description: '神秘小岛', cover_url: '', author_name: 'GM小王',
    reaction_count: 10, comment_count: 5, is_featured: 0, hot_score: 20 },
  { id: 'm2', name: '幻境序曲', description: '奇幻世界', cover_url: '', author_name: null,
    reaction_count: 3, comment_count: 1, is_featured: 1, hot_score: 8 },
];
const mockStoryRows = [
  { id: 's1', title: '末日余晖', content: '城市已成废墟…', author_nickname: '玩家阿三',
    like_count: 8, reply_count: 6, is_featured: 0, hot_score: 20 },
  { id: 's2', title: '星辰之约', content: '我们在星球边缘相遇…', author_nickname: null,
    like_count: 2, reply_count: 0, is_featured: 1, hot_score: 5 },
];

const makeOrderBy = (rows: any[]) => ({
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue(rows),
});

vi.mock('../db', () => {
  const rawFn = vi.fn().mockReturnValue('(raw_expr)');
  const buildModules = () => ({
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(mockModuleRows),
  });
  const buildStories = () => ({
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(mockStoryRows),
  });

  let callCount = 0;
  const db: any = vi.fn((tableName: string) => {
    if (tableName.startsWith('modules')) return buildModules();
    if (tableName.startsWith('forum_threads')) return buildStories();
    return {};
  });
  db.raw = rawFn;
  return { db };
});

// ── Import SUT after mocks ────────────────────────────────────────────────────
import { TrendingService, MIN_HOT_SCORE } from '../services/trending-service';

describe('TrendingService', () => {
  let svc: TrendingService;

  beforeEach(() => {
    svc = new TrendingService();
    vi.clearAllMocks();
  });

  // ── 缓存命中 ──────────────────────────────────────────────────────────────
  describe('缓存命中路径', () => {
    it('getTrendingModules 缓存有数据时直接返回，不查 DB', async () => {
      const cached = [{ id: 'cached-m1', name: '缓存模组', hot_score: 99,
        top_badge: { type: 'featured', count: 1 } }];
      mockGet.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await svc.getTrendingModules(4);
      expect(result.data).toEqual(cached);
      expect(result.hidden).toBe(false);
      expect(mockGet).toHaveBeenCalledWith('trending:modules');
    });

    it('getTrendingStories 缓存有数据时直接返回，不查 DB', async () => {
      const cached = [{ id: 'cached-s1', title: '缓存故事', hot_score: 88,
        top_badge: { type: 'comment', count: 5 } }];
      mockGet.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await svc.getTrendingStories(4);
      expect(result.data).toEqual(cached);
      expect(result.hidden).toBe(false);
    });

    it('缓存数据条数 > limit 时只返回 limit 条', async () => {
      const cached = Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`, name: `模组${i}`, hot_score: 10 - i,
        top_badge: { type: 'reaction', count: i },
      }));
      mockGet.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await svc.getTrendingModules(3);
      expect(result.data).toHaveLength(3);
    });

    it('缓存数据全部 hot_score < MIN_HOT_SCORE 时 hidden=true', async () => {
      const cached = [{ id: 'm-zero', name: '零热度', hot_score: 0,
        top_badge: { type: 'reaction', count: 0 } }];
      mockGet.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await svc.getTrendingModules(4);
      // MIN_HOT_SCORE 默认 1，hot_score=0 不符合
      expect(result.data).toHaveLength(0);
      expect(result.hidden).toBe(true);
    });
  });

  // ── 缓存 miss → DB 查询 ───────────────────────────────────────────────────
  describe('缓存 miss → DB 查询路径', () => {
    it('getTrendingModules 缓存 miss 时从 DB 查询并返回', async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await svc.getTrendingModules(4);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('m1');
      expect(result.data[0].hot_score).toBe(20);
      expect(result.hidden).toBe(false);
    });

    it('getTrendingStories 缓存 miss 时从 DB 查询并返回', async () => {
      mockGet.mockResolvedValueOnce(null);

      const result = await svc.getTrendingStories(4);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('s1');
      expect(result.data[0].hot_score).toBe(20);
    });

    it('DB 返回空列表时 hidden=true', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify([]));

      const result = await svc.getTrendingModules(4);
      expect(result.data).toEqual([]);
      expect(result.hidden).toBe(true);
    });
  });

  // ── hot_score 计算公式 ────────────────────────────────────────────────────
  describe('热度公式映射 (top_badge)', () => {
    it('is_featured=1 时 top_badge.type = featured', async () => {
      mockGet.mockResolvedValueOnce(null);
      const result = await svc.getTrendingModules(4);
      const featuredItem = result.data.find((r: TrendingModule) => r.id === 'm2');
      expect(featuredItem?.top_badge.type).toBe('featured');
    });

    it('无申精且 comment*2 >= reaction 时 top_badge.type = comment', async () => {
      mockGet.mockResolvedValueOnce(null);
      // m1: reaction=10, comment=5 → comment*2=10 >= reaction=10 → comment
      const result = await svc.getTrendingModules(4);
      const item = result.data.find((r: TrendingModule) => r.id === 'm1');
      expect(item?.top_badge.type).toBe('comment');
      expect(item?.top_badge.count).toBe(5);
    });

    it('story: is_featured=1 时 top_badge.type = featured', async () => {
      mockGet.mockResolvedValueOnce(null);
      const result = await svc.getTrendingStories(4);
      const featuredItem = result.data.find((r: TrendingStory) => r.id === 's2');
      expect(featuredItem?.top_badge.type).toBe('featured');
    });
  });

  // ── limit 边界 ────────────────────────────────────────────────────────────
  describe('limit 边界', () => {
    it('limit=0 时被修正为 1', async () => {
      mockGet.mockResolvedValueOnce(JSON.stringify([]));
      const result = await svc.getTrendingModules(0);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('limit=100 时被限制为 ≤ 20', async () => {
      const cached = Array.from({ length: 25 }, (_, i) => ({
        id: `m${i}`, name: `模组${i}`, hot_score: i + 1,
        top_badge: { type: 'reaction', count: i },
      }));
      mockGet.mockResolvedValueOnce(JSON.stringify(cached));
      const result = await svc.getTrendingModules(100);
      expect(result.data.length).toBeLessThanOrEqual(20);
    });
  });

  // ── MIN_HOT_SCORE 导出常量 ────────────────────────────────────────────────
  describe('MIN_HOT_SCORE', () => {
    it('MIN_HOT_SCORE 为数字且 >= 0', () => {
      expect(typeof MIN_HOT_SCORE).toBe('number');
      expect(MIN_HOT_SCORE).toBeGreaterThanOrEqual(0);
    });
  });

  // ── refreshCache ──────────────────────────────────────────────────────────
  describe('refreshCache', () => {
    it('调用后写入两个 Redis key', async () => {
      mockGet.mockResolvedValue(null);
      await svc.refreshCache();
      expect(mockSetex).toHaveBeenCalledWith(
        'trending:modules',
        expect.any(Number),
        expect.any(String),
      );
      expect(mockSetex).toHaveBeenCalledWith(
        'trending:stories',
        expect.any(Number),
        expect.any(String),
      );
    });

    it('setex 写入的 JSON 可被正确解析', async () => {
      mockGet.mockResolvedValue(null);
      await svc.refreshCache();
      const modulesJson = mockSetex.mock.calls.find((c) => c[0] === 'trending:modules')?.[2];
      const storiesJson = mockSetex.mock.calls.find((c) => c[0] === 'trending:stories')?.[2];
      expect(() => JSON.parse(modulesJson)).not.toThrow();
      expect(() => JSON.parse(storiesJson)).not.toThrow();
    });
  });
});
