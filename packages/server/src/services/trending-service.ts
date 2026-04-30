/**
 * TrendingService — 热度排行计算与缓存
 *
 * 热度公式：
 *   modules : reaction_count×1 + comment_count×2 + is_featured×3
 *   stories : like_count×1    + reply_count×2   + is_featured×3
 *
 * 内容质量阈值（热度必须 > MIN_HOT_SCORE 才进入前台）：
 *   default MIN_HOT_SCORE = 1（即至少有一次互动）
 *   可通过环境变量 TRENDING_MIN_HOT_SCORE 覆盖
 *
 * 降级策略：
 *   - 0 条符合阈值 → 该区块整体隐藏（返回空数组，前端判断隐藏）
 *   - 少量符合阈值 → 不凑数，原样返回（不做数量补全）
 *
 * 缓存：每日凌晨 00:01 通过 cron 调用 refreshCache()，
 *       结果以 JSON 写入 Redis (trending:modules / trending:stories)，
 *       TTL = TRENDING_CACHE_TTL_SEC（默认 90000s = 25h，保底覆盖单日）。
 *
 * 读取：先命中缓存，缓存 miss 时执行 DB 查询（最终保障 <200ms）。
 */

import { db } from '../db';
import { redis } from '../db/redis';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface TrendingModule {
  id: string;
  name: string;
  description: string;
  cover_url: string;
  author_name: string | null;
  hot_score: number;
  /** 最高权重互动项标签，用于前端徽标显示 */
  top_badge: { type: 'featured' | 'comment' | 'reaction'; count: number };
}

export interface TrendingStory {
  id: string;
  title: string;
  /** 正文摘要（前 120 字）*/
  summary: string;
  author_nickname: string | null;
  hot_score: number;
  top_badge: { type: 'featured' | 'comment' | 'reaction'; count: number };
}

/** getTrendingModules / getTrendingStories 的响应信封 */
export interface TrendingResult<T> {
  /** 符合质量阈值的条目列表 */
  data: T[];
  /** true 表示数据为 0 条，前端应整体隐藏该区块 */
  hidden: boolean;
  /** 实际写入缓存/返回的条数（可能少于 limit，不凑数） */
  count: number;
}

// ─── 常量 ────────────────────────────────────────────────────────────────────

const CACHE_KEY_MODULES = 'trending:modules';
const CACHE_KEY_STORIES = 'trending:stories';
/** 默认 TTL 90000 秒（约 25 小时），可通过环境变量覆盖 */
const CACHE_TTL_SEC = Number(process.env.TRENDING_CACHE_TTL_SEC ?? 90000);
/** 默认每次最多返回条数上限 */
const MAX_LIMIT = 20;
/**
 * 内容质量阈值：hot_score 必须 > MIN_HOT_SCORE 才进入前台展示。
 * 设为 1 表示至少有 1 次互动（点赞/评论/精选任意一项）。
 * 可通过环境变量 TRENDING_MIN_HOT_SCORE 调整。
 */
export const MIN_HOT_SCORE = Number(process.env.TRENDING_MIN_HOT_SCORE ?? 1);

// ─── 热度徽标辅助 ────────────────────────────────────────────────────────────

function topBadge(
  featured: number,
  commentCount: number,
  reactionCount: number,
): TrendingModule['top_badge'] {
  // 按权重从高到低：featured(3) > comment(2) > reaction(1)
  if (featured) return { type: 'featured', count: 1 };
  if (commentCount * 2 >= reactionCount) return { type: 'comment', count: commentCount };
  return { type: 'reaction', count: reactionCount };
}

// ─── TrendingService ─────────────────────────────────────────────────────────

export class TrendingService {
  // ──────────────────────────────────────────────────────────────────────────
  // 公开读取方法
  // ──────────────────────────────────────────────────────────────────────────

  async getTrendingModules(limit: number = 4): Promise<TrendingResult<TrendingModule>> {
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const cached = await this._getCache<TrendingModule[]>(CACHE_KEY_MODULES);
    const raw = cached ?? await this._queryTrendingModules(MAX_LIMIT);
    // 降级：应用质量阈值后不凑数，0 条则隐藏
    const filtered = raw.filter((m) => m.hot_score >= MIN_HOT_SCORE).slice(0, safeLimit);
    return { data: filtered, hidden: filtered.length === 0, count: filtered.length };
  }

  async getTrendingStories(limit: number = 4): Promise<TrendingResult<TrendingStory>> {
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
    const cached = await this._getCache<TrendingStory[]>(CACHE_KEY_STORIES);
    const raw = cached ?? await this._queryTrendingStories(MAX_LIMIT);
    const filtered = raw.filter((s) => s.hot_score >= MIN_HOT_SCORE).slice(0, safeLimit);
    return { data: filtered, hidden: filtered.length === 0, count: filtered.length };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 缓存刷新（由 cron 调用）
  // ──────────────────────────────────────────────────────────────────────────

  async refreshCache(): Promise<void> {
    const [modules, stories] = await Promise.all([
      this._queryTrendingModules(MAX_LIMIT),
      this._queryTrendingStories(MAX_LIMIT),
    ]);

    await Promise.all([
      redis.setex(CACHE_KEY_MODULES, CACHE_TTL_SEC, JSON.stringify(modules)),
      redis.setex(CACHE_KEY_STORIES, CACHE_TTL_SEC, JSON.stringify(stories)),
    ]);

    const mAboveThreshold = modules.filter((m) => m.hot_score >= MIN_HOT_SCORE).length;
    const sAboveThreshold = stories.filter((s) => s.hot_score >= MIN_HOT_SCORE).length;
    console.log(
      `[Trending] 缓存刷新完成：modules=${modules.length}(质量通过=${mAboveThreshold}) stories=${stories.length}(质量通过=${sAboveThreshold})`,
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 内部 DB 查询
  // ──────────────────────────────────────────────────────────────────────────

  async _queryTrendingModules(limit: number): Promise<TrendingModule[]> {
    const rows = await db('modules as m')
      .leftJoin('users as u', 'u.id', 'm.author_id')
      .where('m.status', 'public')
      .where(
        db.raw('(`m`.`reaction_count` + `m`.`comment_count` * 2 + `m`.`is_featured` * 3)'),
        '>=',
        MIN_HOT_SCORE,
      )
      .select(
        'm.id',
        'm.name',
        'm.description',
        'm.cover_url',
        'u.nickname as author_name',
        'm.reaction_count',
        'm.comment_count',
        'm.is_featured',
        db.raw(
          '(`m`.`reaction_count` + `m`.`comment_count` * 2 + `m`.`is_featured` * 3) AS `hot_score`',
        ),
      )
      .orderBy('hot_score', 'desc')
      .orderBy('m.created_at', 'desc')
      .limit(limit);

    return rows.map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string) || '',
      cover_url: (r.cover_url as string) || '',
      author_name: (r.author_name as string) ?? null,
      hot_score: Number(r.hot_score ?? 0),
      top_badge: topBadge(
        Number(r.is_featured ?? 0),
        Number(r.comment_count ?? 0),
        Number(r.reaction_count ?? 0),
      ),
    }));
  }

  async _queryTrendingStories(limit: number): Promise<TrendingStory[]> {
    const rows = await db('forum_threads as t')
      .leftJoin('users as u', 'u.id', 't.author_id')
      .where('t.board', 'share')
      .where(
        db.raw('(`t`.`like_count` + `t`.`reply_count` * 2 + `t`.`is_featured` * 3)'),
        '>=',
        MIN_HOT_SCORE,
      )
      .select(
        't.id',
        't.title',
        't.content',
        'u.nickname as author_nickname',
        't.like_count',
        't.reply_count',
        't.is_featured',
        db.raw(
          '(`t`.`like_count` + `t`.`reply_count` * 2 + `t`.`is_featured` * 3) AS `hot_score`',
        ),
      )
      .orderBy('hot_score', 'desc')
      .orderBy('t.created_at', 'desc')
      .limit(limit);

    return rows.map((r: any) => ({
      id: r.id as string,
      title: r.title as string,
      summary: ((r.content as string) || '').slice(0, 120),
      author_nickname: (r.author_nickname as string) ?? null,
      hot_score: Number(r.hot_score ?? 0),
      top_badge: topBadge(
        Number(r.is_featured ?? 0),
        Number(r.reply_count ?? 0),
        Number(r.like_count ?? 0),
      ),
    }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 缓存读写
  // ──────────────────────────────────────────────────────────────────────────

  private async _getCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}

export const trendingService = new TrendingService();
