import type { ChatMessage } from '@trpg/shared';
import { db } from '../db';

// ─── T.4 统一过滤模块 ──────────────────────────────────────────────────────

/**
 * 消息可见性过滤器（附录 T.4）
 * 封装 5 步固定过滤顺序（T.2），供消息投递路径和日志导出路径统一复用。
 */
export class MessageVisibilityFilter {
  /**
   * 按 T.2 的 5 步固定顺序计算消息对哪些 userId 可见。
   *
   * 步骤：
   *  ① 特殊类型（system/announcement）→ 全体可见（场内 + GM）
   *  ② visible_to = []（空列表）→ 仅发件人 + GM 可见
   *  ③ visible_to = null → 全体可见（场内 + GM）
   *  ④ visible_to 有值 → 按列表过滤（+ GM）
   *  ⑤ GM 始终注入（任何分支均保证）
   */
  static compute(
    message: Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'>,
    sceneParticipantUserIds: string[],
    gmUserId: string
  ): string[] {
    // ① 特殊类型全体可见
    if (message.message_type === 'system' || message.message_type === 'announcement') {
      return [...new Set([...sceneParticipantUserIds, gmUserId])];
    }

    // ② visible_to = []（空列表）→ 仅发件人 + GM（私密消息/骰子回执等）
    if (Array.isArray(message.visible_to) && message.visible_to.length === 0) {
      const result = new Set<string>();
      if (message.sender_user_id) result.add(message.sender_user_id);
      result.add(gmUserId);
      return [...result];
    }

    // ③ visible_to = null → 全体可见
    if (message.visible_to === null) {
      return [...new Set([...sceneParticipantUserIds, gmUserId])];
    }

    // ④ visible_to 有值 → 按列表过滤（⑤ GM 始终注入）
    const visible = new Set<string>([...message.visible_to, gmUserId]);
    return [...visible];
  }
}

// ─── 向后兼容导出（保持原有调用方不受影响）─────────────────────────────────

/**
 * @deprecated 请使用 `MessageVisibilityFilter.compute()`（附录 T.4）
 * 计算消息对哪些用户可见
 */
export function computeVisibility(
  message: Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'>,
  sceneParticipantUserIds: string[],
  gmUserId: string
): string[] {
  return MessageVisibilityFilter.compute(message, sceneParticipantUserIds, gmUserId);
}

// ─── T.1 write-fanout：按场景类型确定写扩散的初始 visible_to ───────────────

/**
 * 根据场景类型自动计算可见角色 ID 列表（写扩散，附录 T.1）
 * - spatial 场景：当前在场角色（character_scene_states.current_spatial_scene_id = sceneId）
 * - virtual 场景：有效参与者（scene_participations.left_at IS NULL）+ 旁观者（scene_ob_permissions）
 * - lobby 场景：返回 null（全体可见）
 * - 无场景时：返回 null（全体可见）
 *
 * 注意：返回值为 character_id 数组，需调用 characterIdsToUserIds 转换为 userId 后再存储。
 * visible_to=[] 表示"仅发件人+GM"，不从本函数返回，由消息层单独设置。
 */
export async function computeVisibleTo(
  sceneId: string,
  _campaignId: string,
  messageCreatedAt?: Date
): Promise<string[] | null> {
  if (!sceneId) return null;

  const scene = await db('scenes').where({ id: sceneId }).select('type').first().catch(() => null);
  if (!scene) return null;

  switch (scene.type as string) {
    case 'spatial': {
      // T.1：spatial 场景按当前空间位置
      const rows = await db('character_scene_states')
        .where({ current_spatial_scene_id: sceneId })
        .select('character_id');
      const ids = (rows as { character_id: string }[]).map((r) => r.character_id);
      return ids.length > 0 ? ids : null;
    }
    case 'virtual': {
      // T.1：virtual 场景按参与记录（left_at IS NULL）+ 旁观者
      const participantRows = await db('scene_participations')
        .where({ scene_id: sceneId })
        .whereNull('left_at')
        .select('character_id');

      const participantIds = (participantRows as { character_id: string }[]).map((r) => r.character_id);

      const obQuery = db('scene_ob_permissions')
        .where({ scene_id: sceneId })
        .whereNull('revoked_at');
      if (messageCreatedAt) {
        obQuery.andWhere('granted_at', '<=', messageCreatedAt);
      }
      const obRows = await obQuery.select('user_id');
      const obUserIds = (obRows as { user_id: string }[]).map((r) => r.user_id);

      const ids = [...new Set([...participantIds, ...obUserIds])];
      return ids.length > 0 ? ids : null;
    }
    case 'lobby':
    default:
      // T.1：lobby = 全体可见
      return null;
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
  const charRows = await db('character_sheets')
    .whereIn('id', characterIds)
    .select('user_id');

  // visible_to 兼容两种 ID：character_id 与 user_id
  const userRows = await db('users')
    .whereIn('id', characterIds)
    .select('id')
    .catch(() => [] as Array<{ id: string }>);

  const userIds = new Set<string>((charRows as { user_id: string }[]).map((r) => r.user_id));
  for (const row of userRows) {
    userIds.add(row.id);
  }
  userIds.add(gmUserId);
  return [...userIds];
}
