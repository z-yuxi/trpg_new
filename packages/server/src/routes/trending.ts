import { Router, type IRouter } from 'express';
import { trendingService, MIN_HOT_SCORE } from '../services/trending-service';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { logError } from '../utils/structured-logger';

const router: IRouter = Router();

/**
 * GET /api/trending/modules
 * 返回热度最高的模组（最�?4 个）�?
 * 数据来自 Redis 缓存，缓�?miss 时实时查�?DB�?
 *
 * 降级策略�?
 *   - hidden=true  �?数据�?0 条，前端应隐藏整个区�?
 *   - data.length < limit �?不凑数，原样返回
 */
router.get('/modules', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query['limit'] ?? 4), 20);
    const start = Date.now();
    const result = await trendingService.getTrendingModules(limit);
    const elapsed = Date.now() - start;

    res.setHeader('X-Response-Time', `${elapsed}ms`);
    res.json(result);
  } catch (err: unknown) {
    logError('TRENDING_MODULES_QUERY_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: '获取热门模组失败' });
  }
});

/**
 * GET /api/trending/stories
 * 返回热度最高的故事帖子（最�?4 个）�?
 * 同上，降级策略相同�?
 */
router.get('/stories', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query['limit'] ?? 4), 20);
    const start = Date.now();
    const result = await trendingService.getTrendingStories(limit);
    const elapsed = Date.now() - start;

    res.setHeader('X-Response-Time', `${elapsed}ms`);
    res.json(result);
  } catch (err: unknown) {
    logError('TRENDING_STORIES_QUERY_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: '获取热门故事失败' });
  }
});

export default router;

/**
 * POST /api/trending/admin/refresh
 * 手动触发缓存刷新（运维用，需认证）�?
 * 正常情况�?cron 每日 00:01 自动刷新，此端点为紧急补充�?
 */
router.post('/admin/refresh', authMiddleware, async (req, res) => {
  // �?creator 等级以上可手动刷�?
  const user = getAuthedUser(req);
  if (!['creator'].includes(user.subscription_type) && user.creator_level < 3) {
    return res.status(403).json({ error: 'FORBIDDEN', message: '权限不足' });
  }
  try {
    await trendingService.refreshCache();
    res.json({ ok: true, min_hot_score: MIN_HOT_SCORE, refreshed_at: new Date().toISOString() });
  } catch (err: unknown) {
    logError('TRENDING_MANUAL_REFRESH_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: '缓存刷新失败' });
  }
});
