import { Router } from 'express';
import { authMiddleware as requireAuth } from '../middleware/auth';
import { db } from '../db';
import { generateId } from '@trpg/shared';

const router = Router();

// POST /api/reports - 提交举报
router.post('/', requireAuth, async (req, res) => {
  const userId = (req as any).user?.id;
  const { content_type, content_id, reason } = req.body;

  if (!content_type || !content_id || !reason) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  if (typeof reason !== 'string' || reason.length > 128) {
    return res.status(400).json({ error: '举报原因无效' });
  }

  const allowed_types = ['message', 'post', 'user'];
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
  const user = (req as any).user;
  if (user?.role !== 'admin') return res.status(403).json({ error: '无权限' });

  const reports = await db('content_reports')
    .orderBy('created_at', 'desc')
    .limit(100);
  res.json(reports);
});

export default router;
