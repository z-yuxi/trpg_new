import { randomUUID } from 'crypto';
import { db } from '../db';
import type { NotificationType, UserNotification } from '@trpg/shared';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

function rowToNotification(row: Record<string, unknown>): UserNotification {
  return {
    id: row['id'] as string,
    user_id: row['user_id'] as string,
    type: row['type'] as NotificationType,
    title: row['title'] as string,
    content: row['content'] as string,
    metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : null,
    is_read: Boolean(row['is_read']),
    created_at: row['created_at'] as Date,
  };
}

class NotificationService {
  async createNotification(params: CreateNotificationParams): Promise<UserNotification> {
    const id = randomUUID();
    const now = new Date();
    await db('user_notifications').insert({
      id,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      content: params.content,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      is_read: false,
      created_at: now,
    });
    return {
      id,
      user_id: params.userId,
      type: params.type,
      title: params.title,
      content: params.content,
      metadata: params.metadata ?? null,
      is_read: false,
      created_at: now,
    };
  }

  async getUserNotifications(
    userId: string,
    opts: { type?: NotificationType; is_read?: boolean; page?: number; limit?: number }
  ): Promise<{ data: UserNotification[]; total: number }> {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    let q = db('user_notifications').where({ user_id: userId });
    if (opts.type) q = q.where({ type: opts.type });
    if (opts.is_read !== undefined) q = q.where({ is_read: opts.is_read ? 1 : 0 });

    const [total, rows] = await Promise.all([
      q.clone().count('id as count').first().then((r) => Number((r as Record<string, unknown>)?.['count'] ?? 0)),
      q.orderBy('created_at', 'desc').limit(limit).offset(offset).select(),
    ]);

    return { data: (rows as Record<string, unknown>[]).map(rowToNotification), total };
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const updated = await db('user_notifications')
      .where({ id: notificationId, user_id: userId })
      .update({ is_read: true });
    return updated > 0;
  }

  async markAllAsRead(userId: string, type?: NotificationType): Promise<void> {
    let q = db('user_notifications').where({ user_id: userId, is_read: false });
    if (type) q = q.where({ type });
    await q.update({ is_read: true });
  }

  async getUnreadCount(userId: string): Promise<number> {
    const row = await db('user_notifications')
      .where({ user_id: userId, is_read: false })
      .count('id as count')
      .first();
    return Number((row as Record<string, unknown>)?.['count'] ?? 0);
  }
}

export const notificationService = new NotificationService();
