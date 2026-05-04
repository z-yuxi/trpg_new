/**
 * admin-ai.ts
 * 运营后台：AI 功能监控台（只读统计视图）
 *
 * 挂载路径（index.ts）：router.use('/admin', adminAiRoutes)
 * 对应前端页面：AdminAi.vue → GET /api/admin/ai/stats
 *
 * 所有路由要求：已登录 + user_type 包含 'admin'
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { safeErrorMessage } from '../utils/error-response';

const router = Router();

// ── Admin 权限守卫 ────────────────────────────────────────────────────────────
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin permission required' });
    return;
  }
  next();
}

/**
 * GET /admin/ai/stats
 *
 * 返回近 30 天 ai_usage_log 的多维度统计：
 * - summary:      按 status 汇总（success/failed/queued）
 * - daily:        按日期 × task_type × status 分组的调用次数
 * - token_totals: 按 task_type 汇总 input/output tokens（仅 success 记录）
 * - top_users:    按 task_type 前 20 高频用户（用户 ID 脱敏为前 6 位）
 */
router.get('/ai/stats', authMiddleware, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const [summary, daily, tokenTotals, topUsers] = await Promise.all([
      // ── 总体状态汇总 ──────────────────────────────────────────────────────
      db('ai_usage_log')
        .where('created_at', '>=', since)
        .groupBy('status')
        .select('status')
        .count('id as count'),

      // ── 每日 × task_type × status 分组 ────────────────────────────────────
      db('ai_usage_log')
        .where('created_at', '>=', since)
        .groupBy(
          db.raw('DATE(created_at)'),
          'task_type',
          'status',
        )
        .select(
          db.raw('DATE(created_at) AS day'),
          'task_type',
          'status',
        )
        .count('id as count')
        .orderBy('day', 'desc'),

      // ── 按 task_type 汇总 token 消耗（仅 status=success） ─────────────────
      db('ai_usage_log')
        .where('created_at', '>=', since)
        .where('status', 'success')
        .groupBy('task_type')
        .select('task_type')
        .sum('input_tokens as total_input')
        .sum('output_tokens as total_output'),

      // ── 高频用户 Top 20（脱敏：user_id 取前 6 位） ─────────────────────────
      db('ai_usage_log')
        .where('created_at', '>=', since)
        .where('status', 'success')
        .groupBy(
          db.raw('LEFT(user_id, 6)'),
          'task_type',
        )
        .select(
          db.raw('LEFT(user_id, 6) AS uid_prefix'),
          'task_type',
        )
        .count('id as count')
        .orderBy('count', 'desc')
        .limit(20),
    ]);

    res.json({
      summary,
      daily,
      token_totals: tokenTotals,
      top_users: topUsers,
    });
  } catch (err: unknown) {
    console.error('[admin:ai:stats]', err instanceof Error ? err.message : err);
    const message = safeErrorMessage(err, '统计数据查询失败');
    res.status(500).json({ error: 'QUERY_FAILED', message });
  }
});

export default router;
