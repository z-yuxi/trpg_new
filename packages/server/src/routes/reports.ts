import { Router } from 'express';
import { authMiddleware as requireAuth } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { db } from '../db';
import { generateId } from '@trpg/shared';

const router = Router();

// POST /api/reports - 提交举报
router.post('/', requireAuth, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const { content_type, content_id, reason } = req.body;

  if (!content_type || !content_id || !reason) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  if (typeof reason !== 'string' || reason.length > 128) {
    return res.status(400).json({ error: '举报原因无效' });
  }

  const allowed_types = ['message', 'post', 'user', 'module', 'ruleset'];
  if (!allowed_types.includes(content_type)) {
    return res.status(400).json({ error: '不支持的内容类型' });
  }

  const id = generateId();
  await db('content_reports').insert({
    id,
    reporter_user_id: userId,
    content_type,
    content_id: String(content_id).slice(0, 64),
    reason,
    status: 'pending',
  });

  res.status(201).json({ id, message: '举报已收到' });
});

// GET /api/reports (管理员) - MVP 简单实现
router.get('/', requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) return res.status(403).json({ error: '无权限' });

  const reports = await db('content_reports')
    .orderBy('created_at', 'desc')
    .limit(100);

  // 拼接每条工单最新的 AI 建议（动态拼接，不持久化为独立字段）
  const reportIds = reports.map((r: any) => r.id as string);
  const suggestions = reportIds.length
    ? await db('ai_suggestion_log')
        .whereIn('report_id', reportIds)
        .orderBy('created_at', 'desc')
        .select('report_id', 'agent_id', 'action', 'confidence', 'evidence', 'rule', 'created_at')
    : [];

  const suggestionMap = new Map<string, typeof suggestions[number]>();
  for (const s of suggestions) {
    // 保留每条工单最新一条（已按 created_at desc，Map 首次写入即最新）
    if (!suggestionMap.has(s.report_id as string)) {
      suggestionMap.set(s.report_id as string, s);
    }
  }

  const result = reports.map((r: any) => ({
    ...r,
    ai_suggestion: suggestionMap.get(r.id as string) ?? null,
  }));

  res.json(result);
});

// PATCH /api/reports/:id (管理员) - 更新举报状态
router.patch('/:id', requireAuth, async (req, res) => {
  const user = getAuthedUser(req);
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) return res.status(403).json({ error: '无权限' });

  const { id } = req.params;
  const { status, resolution_note } = req.body as { status?: string; resolution_note?: string };

  const allowed = ['resolved', 'dismissed'];
  if (!status || !allowed.includes(status)) {
    return res.status(400).json({ error: 'status 必须是 resolved 或 dismissed' });
  }

  const updated = await db('content_reports')
    .where({ id })
    .update({
      status,
      resolution_note: resolution_note ? String(resolution_note).slice(0, 500) : null,
      resolved_at: new Date(),
      resolver_user_id: user.id,
    });

  if (!updated) return res.status(404).json({ error: '举报不存在' });
  res.json({ id, status });
});

export default router;
