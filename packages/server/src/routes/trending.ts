import { Router, type IRouter } from 'express';
import { trendingService } from '../services/trending-service';

const router: IRouter = Router();

/**
 * GET /api/trending/modules
 * 返回热度最高的模组（最多 4 个）。
 * 数据来自 Redis 缓存，缓存 miss 时实时查询 DB。
 */
router.get('/modules', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query['limit'] ?? 4), 20);
    const start = Date.now();
    const data = await trendingService.getTrendingModules(limit);
    const elapsed = Date.now() - start;

    res.setHeader('X-Response-Time', `${elapsed}ms`);
    res.json({ data });
  } catch (err: any) {
    console.error('[Trending] modules query error:', err?.message ?? err);
    res.status(500).json({ error: '获取热门模组失败' });
  }
});

/**
 * GET /api/trending/stories
 * 返回热度最高的故事帖子（最多 4 个）。
 */
router.get('/stories', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query['limit'] ?? 4), 20);
    const start = Date.now();
    const data = await trendingService.getTrendingStories(limit);
    const elapsed = Date.now() - start;

    res.setHeader('X-Response-Time', `${elapsed}ms`);
    res.json({ data });
  } catch (err: any) {
    console.error('[Trending] stories query error:', err?.message ?? err);
    res.status(500).json({ error: '获取热门故事失败' });
  }
});

export default router;
