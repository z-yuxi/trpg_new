import type { Namespace, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, ChatMessage, StoryTime } from '@trpg/shared';
import { snowflake, generateId } from '@trpg/shared';
import { redis, RedisKeys } from '../db/redis';
import { db } from '../db';

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

/** 比较两个 StoryTime，返回 1 / 0 / -1 */
function compareStoryTime(a: StoryTime, b: StoryTime): number {
  if (a.day !== b.day) return a.day > b.day ? 1 : -1;
  if (a.hour !== b.hour) return a.hour > b.hour ? 1 : -1;
  if (a.minute !== b.minute) return a.minute > b.minute ? 1 : -1;
  return 0;
}

export function registerChatHandlers(
  roomNsp: Namespace<ClientToServerEvents, ServerToClientEvents>
): void {
  roomNsp.on('connection', (socket: RoomSocket) => {
    const userId = socket.data.userId as string;

    // join_room 事件
    socket.on('join_room', async (data) => {
      try {
        const { campaign_id, character_id, last_event_id } = data;
        socket.data.campaignId = campaign_id;
        socket.data.characterId = character_id;
        socket.join(`campaign:${campaign_id}`);

        await redis.sadd(RedisKeys.campaignOnline(campaign_id), userId);
        await redis.set(RedisKeys.userSocket(userId), socket.id);

        if (last_event_id) {
          const { handleReconnection } = await import('./reconnection-handler.js');
          await handleReconnection(socket, campaign_id, character_id, last_event_id);
        }
      } catch (err) {
        console.error('[join_room] handler error:', err);
      }
    });

    // leave_room 事件
    socket.on('leave_room', async () => {
      try {
        const campaignId = socket.data.campaignId as string;
        if (campaignId) {
          socket.leave(`campaign:${campaignId}`);
          await redis.srem(RedisKeys.campaignOnline(campaignId), userId);
          await redis.del(RedisKeys.userSocket(userId));
        }
      } catch (err) {
        console.error('[leave_room] handler error:', err);
      }
    });

    // 订阅当前浏览场景（客户端切换场景时调用）
    socket.on('subscribe_scene', (data) => {
      socket.data.activeSceneId = data.scene_id;
    });

    // chat_message 事件
    socket.on('chat_message', async (data) => {
      try {
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

      // 从 character_scene_states 查询当前角色所在场景
      let sceneId = '';
      if (characterId) {
        const sceneState = await db('character_scene_states')
          .where({ character_id: characterId, campaign_id: campaignId })
          .select('current_spatial_scene_id')
          .first()
          .catch(() => null);
        sceneId = sceneState?.current_spatial_scene_id ?? '';
      }

      // 从 campaigns 查询当前全局故事时间
      let storyTime: StoryTime | null = null;
      const campaignRow = await db('campaigns')
        .where({ id: campaignId })
        .select('global_story_time')
        .first()
        .catch(() => null);
      if (campaignRow?.global_story_time) {
        try {
          storyTime = typeof campaignRow.global_story_time === 'string'
            ? JSON.parse(campaignRow.global_story_time)
            : campaignRow.global_story_time;
        } catch {
          storyTime = null;
        }
      }

      const messageId = snowflake.nextId();

      const message: ChatMessage = {
        id: messageId,
        scene_id: sceneId,
        campaign_id: campaignId,
        sender_user_id: userId,
        sender_character_id: characterId || null,
        content: data.content,
        message_type: (data.message_type as ChatMessage['message_type']) || 'narrative',
        story_time: storyTime,
        visible_to: data.visible_to || null,
        client_timestamp: Date.now(),
        created_at: new Date(),
        metadata: data.metadata || null,
      };

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

      await redis.lpush(RedisKeys.messageBuffer(campaignId), JSON.stringify(message));
      await redis.ltrim(RedisKeys.messageBuffer(campaignId), 0, 199);

      roomNsp.to(`campaign:${campaignId}`).emit('new_message', message);
      } catch (err) {
        console.error('[chat_message] handler error:', err);
      }
    });

    // GM 推进时间
    socket.on('gm_advance_time', async (data) => {
      try {
      const campaignId = socket.data.campaignId as string;
      if (!campaignId) return;

      const campaign = await db('campaigns').where({ id: campaignId }).first();
      if (!campaign || campaign.gm_user_id !== userId) return;

      let currentTime: StoryTime = { day: 1, hour: 8, minute: 0 };
      try {
        currentTime = typeof campaign.global_story_time === 'string'
          ? JSON.parse(campaign.global_story_time)
          : campaign.global_story_time ?? currentTime;
      } catch { /* 默认值 */ }

      // 计算新时间：优先使用 custom_time，否则在当前时间上加 delta
      let newTime: StoryTime;
      if (data.custom_time) {
        newTime = data.custom_time;
      } else if (data.delta) {
        const totalMinutes =
          currentTime.day * 24 * 60 +
          currentTime.hour * 60 +
          currentTime.minute +
          (data.delta.days ?? 0) * 24 * 60 +
          (data.delta.hours ?? 0) * 60 +
          (data.delta.minutes ?? 0);
        newTime = {
          day: Math.floor(totalMinutes / (24 * 60)),
          hour: Math.floor((totalMinutes % (24 * 60)) / 60),
          minute: totalMinutes % 60,
        };
      } else {
        return;
      }

      if (compareStoryTime(newTime, currentTime) <= 0) return;

      await db('campaigns').where({ id: campaignId }).update({
        global_story_time: JSON.stringify(newTime),
      });

      // 查找并执行到期的 scheduled_moves
      const pendingMoves = await db('scheduled_moves')
        .where({ campaign_id: campaignId, status: 'pending' })
        .select();

      const triggeredMoves: { move_id: string; character_id: string; to_scene_id: string }[] = [];
      for (const move of pendingMoves) {
        let executeAt: StoryTime;
        try {
          executeAt = typeof move.execute_at_story === 'string'
            ? JSON.parse(move.execute_at_story)
            : move.execute_at_story;
        } catch { continue; }

        if (compareStoryTime(executeAt, newTime) <= 0) {
          await db('character_scene_states')
            .where({ character_id: move.character_id, campaign_id: campaignId })
            .update({ current_spatial_scene_id: move.to_scene_id });

          await db('position_history').insert({
            id: generateId(),
            campaign_id: campaignId,
            character_id: move.character_id,
            scene_id: move.to_scene_id,
            story_time_entered: JSON.stringify(newTime),
            story_time_left: null,
            move_type: 'scheduled',
          });

          await db('scheduled_moves').where({ id: move.id }).update({ status: 'executed' });
          triggeredMoves.push({ move_id: move.id, character_id: move.character_id, to_scene_id: move.to_scene_id });
        }
      }

      roomNsp.to(`campaign:${campaignId}`).emit('time_advanced', {
        old_time: currentTime,
        new_time: newTime,
        triggered_moves: triggeredMoves,
      });
      } catch (err) {
        console.error('[gm_advance_time] handler error:', err);
      }
    });

    // 请求移动
    socket.on('request_move', async (data) => {
      try {
      const { target_scene_id } = data;
      const campaignId = socket.data.campaignId as string;
      const characterId = socket.data.characterId as string;
      if (!characterId || !campaignId) return;

      const campaign = await db('campaigns').where({ id: campaignId }).select('global_story_time', 'gm_user_id').first();
      const executeAt = campaign?.global_story_time
        ? (typeof campaign.global_story_time === 'string' ? campaign.global_story_time : JSON.stringify(campaign.global_story_time))
        : JSON.stringify({ day: 1, hour: 8, minute: 0 });

      const moveId = generateId();
      await db('scheduled_moves').insert({
        id: moveId,
        character_id: characterId,
        campaign_id: campaignId,
        to_scene_id: target_scene_id,
        execute_at_story: executeAt,
        status: 'pending',
      });

      if (campaign?.gm_user_id) {
        const gmSocketId = await redis.get(RedisKeys.userSocket(campaign.gm_user_id));
        if (gmSocketId) {
          // move_requested 是内部GM通知，不在标准 ServerToClientEvents 中
          (roomNsp.to(gmSocketId) as any).emit('move_requested', {
            move_id: moveId,
            character_id: characterId,
            to_scene_id: target_scene_id,
            campaign_id: campaignId,
          });
        }
      }
      } catch (err) {
        console.error('[request_move] handler error:', err);
      }
    });

    // GM 审批移动
    socket.on('gm_approve_move', async (data) => {
      try {
      const { move_id } = data;
      const move = await db('scheduled_moves').where({ id: move_id }).first();
      if (!move) return;

      await db('scheduled_moves').where({ id: move_id }).update({ status: 'approved' });

      const charSheet = await db('character_sheets').where({ id: move.character_id }).select('user_id').first();
      if (charSheet?.user_id) {
        const playerSocketId = await redis.get(RedisKeys.userSocket(charSheet.user_id));
        if (playerSocketId) {
          const executeAt: StoryTime = move.execute_at_story
            ? (typeof move.execute_at_story === 'string' ? JSON.parse(move.execute_at_story) : move.execute_at_story)
            : { day: 1, hour: 8, minute: 0 };
          roomNsp.to(playerSocketId).emit('move_approved', { move_id, execute_at: executeAt });
        }
      }
      } catch (err) {
        console.error('[gm_approve_move] handler error:', err);
      }
    });

    // GM 拒绝移动
    socket.on('gm_reject_move', async (data) => {
      try {
      const { move_id } = data;
      const move = await db('scheduled_moves').where({ id: move_id }).first();
      if (!move) return;

      await db('scheduled_moves').where({ id: move_id }).update({ status: 'cancelled' });

      const charSheet = await db('character_sheets').where({ id: move.character_id }).select('user_id').first();
      if (charSheet?.user_id) {
        const playerSocketId = await redis.get(RedisKeys.userSocket(charSheet.user_id));
        if (playerSocketId) {
          roomNsp.to(playerSocketId).emit('move_rejected', { move_id });
        }
      }
      } catch (err) {
        console.error('[gm_reject_move] handler error:', err);
      }
    });

    // 断线
    socket.on('disconnect', async () => {
      try {
        const campaignId = socket.data.campaignId as string;
        if (campaignId) {
          await redis.srem(RedisKeys.campaignOnline(campaignId), userId);
          await redis.del(RedisKeys.userSocket(userId));
        }
      } catch (err) {
        console.error('[disconnect] handler error:', err);
      }
    });
  });
}
