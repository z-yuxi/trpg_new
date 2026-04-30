import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';
import { getMessagesAfter, getRecentMessages } from '../utils/ring-buffer';
import { db } from '../db';
import { safeJsonParse } from '../utils/safe-json';

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/**
 * 处理客户端重连
 * 逻辑：
 * 1. 客户端携带 last_event_id 重新 join_room
 * 2. 从 Redis 环形缓冲区查找该 ID 之后的消息
 * 3. 如果缓冲区中找到 → 直接返回缓冲中的消息
 * 4. 如果缓冲区中找不到（断线太久）→ 从 MySQL 查询
 * 5. 发送 missed_messages 事件
 */
export async function handleReconnection(
  socket: RoomSocket,
  campaignId: string,
  _characterId: string,
  lastEventId: string | undefined
): Promise<void> {
  if (!lastEventId) {
    // 无上次事件 ID，不发送补发消息
    return;
  }

  // 从 Redis 环形缓冲区查找
  let missedMessages = await getMessagesAfter(campaignId, lastEventId);

  if (missedMessages.length === 0) {
    // 缓冲区中找不到，从 MySQL 查询（断线太久的情况）
    // 使用时间范围（最近 24 小时）而非固定条数，确保消息完整性
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dbMessages = await db('chat_messages')
      .where('campaign_id', campaignId)
      .where('id', '>', String(lastEventId))
      .where('created_at', '>=', since)
      .orderBy('id', 'asc')
      .select();

    missedMessages = dbMessages.map((row) => ({
      ...row,
      id: row.id.toString(),
      visible_to: safeJsonParse(row.visible_to, null),
      story_time: safeJsonParse(row.story_time, null),
      metadata: safeJsonParse(row.metadata, null),
    }));
  }

  if (missedMessages.length === 0) {
    return;
  }

  // 获取当前团状态：角色状态 + 全局时间
  const [campaignRow, sceneState] = await Promise.all([
    db('campaigns').where('id', campaignId).first(),
    _characterId
      ? db('character_scene_states')
          .where({ character_id: _characterId, campaign_id: campaignId })
          .first()
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const globalTime = safeJsonParse(campaignRow?.global_story_time, { day: 1, hour: 8, minute: 0 });

  // 如果断线超过 24 小时（消息可能不完整），通知客户端刷新完整状态
  const typedMessages = missedMessages as Array<{ id: string | number }>;
  const oldestMessageId = typedMessages[0]?.id;
  const disconnectTooLong = !oldestMessageId || String(lastEventId) < String(oldestMessageId);

  socket.emit('missed_messages', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: missedMessages as any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    your_state: sceneState ?? ({} as any),
    global_time: globalTime,
    incomplete: disconnectTooLong,
  });
}
