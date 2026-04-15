import type { Namespace, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, ChatMessage } from '@trpg/shared';
import { snowflake } from '@trpg/shared';
import { redis, RedisKeys } from '../db/redis';
import { db } from '../db';
import { computeVisibility } from '../services/visibility';

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerChatHandlers(
  roomNsp: Namespace<ClientToServerEvents, ServerToClientEvents>
): void {
  roomNsp.on('connection', (socket: RoomSocket) => {
    const userId = socket.data.userId as string;

    // join_room 事件
    socket.on('join_room', async (data) => {
      const { campaign_id, character_id, last_event_id } = data;
      socket.data.campaignId = campaign_id;
      socket.data.characterId = character_id;
      socket.join(`campaign:${campaign_id}`);

      // 记录在线状态到 Redis
      await redis.sadd(RedisKeys.campaignOnline(campaign_id), userId);
      await redis.set(RedisKeys.userSocket(userId), socket.id);

      // 如果有 last_event_id，发送 missed_messages（步骤 18 实现补全）
      if (last_event_id) {
        const { handleReconnection } = await import('./reconnection-handler');
        await handleReconnection(socket, campaign_id, character_id, last_event_id);
      }
    });

    // leave_room 事件
    socket.on('leave_room', async () => {
      const campaignId = socket.data.campaignId as string;
      if (campaignId) {
        socket.leave(`campaign:${campaignId}`);
        await redis.srem(RedisKeys.campaignOnline(campaignId), userId);
        await redis.del(RedisKeys.userSocket(userId));
      }
    });

    // chat_message 事件
    socket.on('chat_message', async (data) => {
      const campaignId = socket.data.campaignId as string;
      const characterId = socket.data.characterId as string;

      if (!campaignId) return;

      // 限流检查：每用户每秒最多 5 条
      const rateLimitKey = RedisKeys.rateLimit(userId);
      const count = await redis.incr(rateLimitKey);
      if (count === 1) await redis.expire(rateLimitKey, 1);
      if (count > 5) {
        socket.emit('rate_limited', { retry_after: 1, message: '发送过于频繁，请稍后再试' });
        return;
      }

      // 生成 snowflake ID
      const messageId = snowflake.nextId();

      // 构建消息对象
      const message: ChatMessage = {
        id: messageId,
        scene_id: '',          // 从角色状态获取当前场，步骤后续完善
        campaign_id: campaignId,
        sender_user_id: userId,
        sender_character_id: characterId || null,
        content: data.content,
        message_type: (data.message_type as ChatMessage['message_type']) || 'narrative',
        story_time: null,      // 从团获取当前故事时间，步骤后续完善
        visible_to: data.visible_to || null,
        client_timestamp: Date.now(),
        created_at: new Date(),
        metadata: data.metadata || null,
      };

      // 持久化到 MySQL
      await db('chat_messages').insert({
        id: BigInt(message.id),
        scene_id: message.scene_id,
        campaign_id: message.campaign_id,
        sender_user_id: message.sender_user_id,
        sender_character_id: message.sender_character_id,
        content: message.content,
        message_type: message.message_type,
        story_time: message.story_time ? JSON.stringify(message.story_time) : null,
        visible_to: message.visible_to ? JSON.stringify(message.visible_to) : null,
        client_timestamp: message.client_timestamp,
        created_at: message.created_at,
        metadata: message.metadata ? JSON.stringify(message.metadata) : null,
      });

      // 写入 Redis 环形缓冲区
      await redis.lpush(RedisKeys.messageBuffer(campaignId), JSON.stringify(message));
      await redis.ltrim(RedisKeys.messageBuffer(campaignId), 0, 199); // 保留最近 200 条

      // 广播消息（写扩散）
      roomNsp.to(`campaign:${campaignId}`).emit('new_message', message);
    });

    // GM 推进时间
    socket.on('gm_advance_time', async (data) => {
      // 占位，在步骤 34 完善 GM 控制台时完整实现
      console.log('[chat-handler] gm_advance_time:', data);
    });

    // 请求移动
    socket.on('request_move', async (data) => {
      console.log('[chat-handler] request_move:', data);
    });

    // GM 审批/拒绝移动
    socket.on('gm_approve_move', async (data) => {
      console.log('[chat-handler] gm_approve_move:', data);
    });
    socket.on('gm_reject_move', async (data) => {
      console.log('[chat-handler] gm_reject_move:', data);
    });

    // 断线
    socket.on('disconnect', async () => {
      const campaignId = socket.data.campaignId as string;
      if (campaignId) {
        await redis.srem(RedisKeys.campaignOnline(campaignId), userId);
        await redis.del(RedisKeys.userSocket(userId));
      }
    });
  });
}
