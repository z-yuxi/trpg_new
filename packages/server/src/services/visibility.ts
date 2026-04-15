import type { ChatMessage } from '@trpg/shared';

/**
 * 计算消息对哪些用户可见
 * 规则：
 * 1. visible_to 为 null → 场内所有人可见
 * 2. visible_to 为 string[] → 只有列表中的 user_id 可见
 * 3. GM 始终可见所有消息
 * 4. system 和 announcement 类型消息始终全体可见
 */
export function computeVisibility(
  message: Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'>,
  sceneParticipantUserIds: string[],
  gmUserId: string
): string[] {
  // system 和 announcement 类型消息始终全体可见
  if (message.message_type === 'system' || message.message_type === 'announcement') {
    return [...new Set([...sceneParticipantUserIds, gmUserId])];
  }

  // visible_to 为 null → 场内所有人可见
  if (message.visible_to === null) {
    return [...new Set([...sceneParticipantUserIds, gmUserId])];
  }

  // visible_to 为指定用户列表 → 只有列表中的用户 + GM 可见
  const visible = new Set<string>([...message.visible_to, gmUserId]);
  return [...visible];
}
