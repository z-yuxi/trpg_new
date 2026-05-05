import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { notificationService } from '../services/notification-service';
import type { NotificationType, NotificationCategory } from '@trpg/shared';
import { NOTIFICATION_CATEGORY_TYPES } from '@trpg/shared';

const router = Router();

// GET /api/notifications
// 支持 ?category=trpg|community|system（UI 分类）或 ?type=具体类型
router.get('/', authMiddleware, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const { type, category, is_read, page, limit } = req.query as Record<string, string>;

  // category 优先于 type：把分类展开为多个 type 过滤
  let typeFilter: NotificationType | undefined = type as NotificationType | undefined;
  let typesFilter: NotificationType[] | undefined;
  if (category && category in NOTIFICATION_CATEGORY_TYPES) {
    typesFilter = NOTIFICATION_CATEGORY_TYPES[category as NotificationCategory];
    typeFilter = undefined;
  }

  const result = await notificationService.getUserNotifications(userId, {
    type: typeFilter,
    types: typesFilter,
    is_read: is_read === 'true' ? true : is_read === 'false' ? false : undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 50,
  });
  res.json(result);
});

// GET /api/notifications/unread-count
router.get('/unread-count', authMiddleware, async (req, res) => {
  const count = await notificationService.getUnreadCount(getAuthedUser(req).id);
  res.json({ count });
});

// PUT /api/notifications/read-all
// 支持 { type } 或 { category } 两种粒度
router.put('/read-all', authMiddleware, async (req, res) => {
  const { type, category } = req.body as { type?: NotificationType; category?: NotificationCategory };
  let typesFilter: NotificationType[] | undefined;
  if (category && category in NOTIFICATION_CATEGORY_TYPES) {
    typesFilter = NOTIFICATION_CATEGORY_TYPES[category];
  }
    await notificationService.markAllAsRead(getAuthedUser(req).id, type, typesFilter);
  res.json({ success: true });
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, async (req, res) => {
  const ok = await notificationService.markAsRead(req.params['id']!, getAuthedUser(req).id);
  if (!ok) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ success: true });
});

export default router;
