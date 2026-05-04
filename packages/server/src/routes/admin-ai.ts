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

/**
 * GET /admin/ai/training
 *
 * 返回 AI 训练数据治理统计与可导出的合规数据摘要：
 * - consent_stats: 用户同意/不同意/默认（未设置）数量
 * - eligible_records: 近 30 天 allow_ai_train=true 用户的成功任务数（按 task_type 分组）
 * - data 边界说明：仅返回汇总数字和 task_type 分布，不返回原始文本内容
 *
 * 注意：实际训练数据的导出须由数据治理团队人工审批，此接口仅为统计视图。
 */
router.get('/ai/training', authMiddleware, requireAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const [consentStats, eligibleRecords] = await Promise.all([
      // ── 用户同意状态分布 ──────────────────────────────────────────────────
      db('users')
        .groupBy('allow_ai_train')
        .select('allow_ai_train')
        .count('id as count'),

      // ── 近 30 天可训练任务数（已同意用户 × 成功任务） ──────────────────────
      db('ai_usage_log as log')
        .join('users', 'users.id', 'log.user_id')
        .where('users.allow_ai_train', true)
        .where('log.status', 'success')
        .where('log.created_at', '>=', since)
        .groupBy('log.task_type')
        .select('log.task_type')
        .count('log.id as count'),
    ]);

    res.json({
      consent_stats: consentStats.map((r: any) => ({
        opted_in: r.allow_ai_train === true || r.allow_ai_train === 1,
        count: Number(r.count),
      })),
      eligible_records: eligibleRecords,
      notice: '此接口仅返回汇总统计，实际训练数据导出需人工审批，不可自动执行',
    });
  } catch (err: unknown) {
    console.error('[admin:ai:training]', err instanceof Error ? err.message : err);
    const message = safeErrorMessage(err, '训练数据统계查询失败');
    res.status(500).json({ error: 'QUERY_FAILED', message });
  }
});

export default router;
