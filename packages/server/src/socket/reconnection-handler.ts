import type { Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';
import { getMessagesAfter, getRecentMessages } from '../utils/ring-buffer';
import { db } from '../db';

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
    const dbMessages = await db('chat_messages')
      .where('campaign_id', campaignId)
      .where('id', '>', BigInt(lastEventId))
      .orderBy('id', 'asc')
      .limit(100)
      .select();

    missedMessages = dbMessages.map((row) => ({
      ...row,
      id: row.id.toString(),
      visible_to: row.visible_to ? JSON.parse(row.visible_to as string) : null,
      story_time: row.story_time ? JSON.parse(row.story_time as string) : null,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    }));
  }

  if (missedMessages.length === 0) {
    return;
  }

  // 获取当前团状态（角色状态和全局时间）用于 your_state 和 global_time
  // TODO: 在后续步骤中完善角色状态读取
  const campaignRow = await db('campaigns').where('id', campaignId).first();

  socket.emit('missed_messages', {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: missedMessages as any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    your_state: {} as any,  // 后续步骤完善
    global_time: campaignRow?.global_story_time
      ? JSON.parse(campaignRow.global_story_time as string)
      : { day: 1, hour: 8, minute: 0 },
  });
}
