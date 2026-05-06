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
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware, requireAdmin } from '../middleware/auth';
import { db } from '../db';
import { safeErrorMessage } from '../utils/error-response';
import { logError } from '../utils/structured-logger';
import { generateId } from '@trpg/shared';

const router = Router();

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
    logError('ADMIN_AI_STATS_QUERY_FAILED', 'high', safeErrorMessage(err, '统计数据查询失败'));
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
    logError('ADMIN_AI_TRAINING_QUERY_FAILED', 'high', safeErrorMessage(err, '训练数据统计查询失败'));
    const message = safeErrorMessage(err, '训练数据统计查询失败');
    res.status(500).json({ error: 'QUERY_FAILED', message });
  }
});
/**
 * POST /admin/ai-suggestions
 *
 * 供代码包B（Agent 服务）上报 AI 审查建议，写入 ai_suggestion_log。
 * 认证：Bearer Token，值为环境变量 AGENT_SERVICE_API_KEY。
 *
 * 请求体字段：
 *   agent_id*    string   发起建议的 Agent 标识（如 agent_ab）
 *   report_id*   string   关联举报工单 ID
 *   action*      string   建议操作（如 delete_post / restrict_user）
 *   confidence*  number   置信度 0-100
 *   evidence     string   违规证据描述（可选）
 *   rule         string   匹配规则引用（可选）
 *   decision_trace string 详细推理轨迹（可选，敏感，前端默认折叠）
 */
const aiSuggestionSchema = z.object({
  agent_id: z.string().min(1).max(64),
  report_id: z.string().min(1).max(64),
  action: z.string().min(1).max(64),
  confidence: z.number().int().min(0).max(100),
  evidence: z.string().max(4000).optional(),
  rule: z.string().max(1000).optional(),
  decision_trace: z.string().max(10000).optional(),
});

/** 验证代码包B服务的 API Key，不复用用户 JWT */
function verifyAgentApiKey(req: Request, res: Response): boolean {
  const expectedKey = process.env['AGENT_SERVICE_API_KEY'];
  if (!expectedKey) {
    // 未配置时拒绝所有请求（防止生产环境误放行）
    res.status(503).json({ error: 'SERVICE_UNAVAILABLE', message: 'Agent 服务未配置' });
    return false;
  }
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== expectedKey) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Agent API Key 无效' });
    return false;
  }
  return true;
}

router.post('/ai-suggestions', async (req: Request, res: Response): Promise<void> => {
  if (!verifyAgentApiKey(req, res)) return;

  const parsed = aiSuggestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const { agent_id, report_id, action, confidence, evidence, rule, decision_trace } = parsed.data;

  try {
    // 确认关联工单存在
    const report = await db('content_reports').where({ id: report_id }).first();
    if (!report) {
      res.status(404).json({ error: 'NOT_FOUND', message: '关联举报工单不存在' });
      return;
    }

    const id = generateId();
    await db('ai_suggestion_log').insert({
      id,
      report_id,
      agent_id,
      action,
      confidence,
      evidence: evidence ?? null,
      rule: rule ?? null,
      decision_trace: decision_trace ?? null,
    });

    res.status(201).json({ id, report_id, status: 'recorded' });
  } catch (err: unknown) {
    logError('ADMIN_AI_SUGGESTION_WRITE_FAILED', 'high', safeErrorMessage(err, 'AI 建议写入失败'), { agent_id: parsed.data?.agent_id });
    const message = safeErrorMessage(err, 'AI 建议写入失败');
    res.status(500).json({ error: 'INTERNAL_ERROR', message });
  }
});
export default router;
