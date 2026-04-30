/**
 * 私信（Direct Messages）
 * 产品设计依据：附录 I：个人中心与成长体系
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export interface Conversation {
  id: string;
  other_user: { id: string; nickname: string; avatar_url?: string };
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  type: 'text' | 'image';
  image_url?: string;
}

export function listConversations(): Promise<Conversation[]> {
  return api.get('/messages/conversations');
}

export function getMessages(conversationId: string, params?: { limit?: number; before?: string }): Promise<DirectMessage[]> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/messages/conversations/${conversationId}/messages${qs}`);
}

export function markConversationRead(conversationId: string): Promise<void> {
  return api.put(`/messages/conversations/${conversationId}/read`, {});
}

export function sendMessage(conversationId: string, payload: { content: string; type?: 'text' | 'image'; image_url?: string }): Promise<DirectMessage> {
  return api.post(`/messages/conversations/${conversationId}/messages`, payload, key());
}

export function createConversation(targetUserId: string): Promise<Conversation> {
  return api.post('/messages/conversations', { target_user_id: targetUserId }, key());
}

export function searchUsersForDm(keyword: string): Promise<Array<{ id: string; uid: number; nickname: string; avatar_url?: string }>> {
  return api.get(`/messages/search-users?keyword=${encodeURIComponent(keyword)}`);
}
