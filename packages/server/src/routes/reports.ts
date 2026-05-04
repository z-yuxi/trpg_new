import { Router } from 'express';
import { authMiddleware as requireAuth } from '../middleware/auth';
import { db } from '../db';
import { generateId } from '@trpg/shared';

const router = Router();

// POST /api/reports - 提交举报
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user!.id;
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
  const user = req.user!;
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) return res.status(403).json({ error: '无权限' });

  const reports = await db('content_reports')
    .orderBy('created_at', 'desc')
    .limit(100);
  res.json(reports);
});

// PATCH /api/reports/:id (管理员) - 更新举报状态
router.patch('/:id', requireAuth, async (req, res) => {
  const user = req.user!;
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
