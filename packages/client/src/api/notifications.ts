/**
 * 通知
 * 产品设计依据：附录 I03：通知系统规范
 */
import { api } from '../utils/api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface ListNotificationsParams {
  limit?: number;
  offset?: number;
  unread_only?: boolean;
  category?: string;
  page?: number;
}

export function listNotifications(params?: ListNotificationsParams): Promise<{ data: Notification[]; total: number }> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/notifications${qs}`);
}

export function markNotificationRead(id: string): Promise<void> {
  return api.put(`/notifications/${id}/read`, {});
}

export function markAllNotificationsRead(params?: { category?: string }): Promise<void> {
  return api.put('/notifications/read-all', params ?? {});
}

export function getUnreadCount(): Promise<{ count: number }> {
  return api.get('/notifications/unread-count');
}
