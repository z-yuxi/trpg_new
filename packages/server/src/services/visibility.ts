import type { ChatMessage } from '@trpg/shared';
import { db } from '../db';

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

/**
 * 根据场景类型自动计算可见角色 ID 列表（写扩散）
 * - spatial 场景：当前在场角色（character_scene_states.current_spatial_scene_id = sceneId）
 * - virtual 场景：有效参与者（scene_participations.left_at IS NULL）
 * - lobby 场景：返回 null（全体可见）
 * - 无场景时：返回 null（全体可见）
 */
export async function computeVisibleTo(
  sceneId: string,
  _campaignId: string
): Promise<string[] | null> {
  if (!sceneId) return null;

  const scene = await db('scenes').where({ id: sceneId }).select('type').first().catch(() => null);
  if (!scene) return null;

  switch (scene.type as string) {
    case 'spatial': {
      const rows = await db('character_scene_states')
        .where({ current_spatial_scene_id: sceneId })
        .select('character_id');
      const ids = (rows as { character_id: string }[]).map((r) => r.character_id);
      return ids.length > 0 ? ids : null;
    }
    case 'virtual': {
      const rows = await db('scene_participations')
        .where({ scene_id: sceneId })
        .whereNull('left_at')
        .select('character_id');
      const ids = (rows as { character_id: string }[]).map((r) => r.character_id);
      return ids.length > 0 ? ids : null;
    }
    case 'lobby':
    default:
      return null; // 大厅 = 全体可见
  }
}

/**
 * 根据角色 ID 列表获取对应的用户 ID 列表（+ GM）
 */
export async function characterIdsToUserIds(
  characterIds: string[],
  gmUserId: string
): Promise<string[]> {
  if (characterIds.length === 0) return [gmUserId];
  const rows = await db('character_sheets')
    .whereIn('id', characterIds)
    .select('user_id');
  const userIds = new Set<string>((rows as { user_id: string }[]).map((r) => r.user_id));
  userIds.add(gmUserId);
  return [...userIds];
}
