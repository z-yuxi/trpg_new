import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { notificationService } from '../services/notification-service';
import type { NotificationType } from '@trpg/shared';

const router = Router();

// GET /api/notifications
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  const { type, is_read, page, limit } = req.query as Record<string, string>;
  const result = await notificationService.getUserNotifications(userId, {
    type: type as NotificationType | undefined,
    is_read: is_read === 'true' ? true : is_read === 'false' ? false : undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });
  res.json(result);
});

// GET /api/notifications/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user!.id);
  res.json({ count });
});

// PUT /api/notifications/read-all
router.put('/read-all', authMiddleware, async (req, res) => {
  const { type } = req.body as { type?: NotificationType };
  await notificationService.markAllAsRead(req.user!.id, type);
  res.json({ success: true });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, async (req, res) => {
  const ok = await notificationService.markAsRead(req.params['id']!, req.user!.id);
  if (!ok) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ success: true });
});

export default router;
