import type { Namespace, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, ChatMessage, StoryTime } from '@trpg/shared';
import { snowflake, generateId } from '@trpg/shared';
import { redis, RedisKeys } from '../db/redis';
import { db } from '../db';
import { computeVisibleTo, characterIdsToUserIds } from '../services/visibility';
import { notificationService } from '../services/notification-service';
import { rulesetService } from '../services/ruleset-service';
import { characterInstanceService } from '../services/character-sheet-service';
import { resolveCommand } from '../engine/command-resolver';
import { announceTime } from '../services/time';
import { approveMove } from '../services/movement';

type RoomSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function registerChatHandlers(
  roomNsp: Namespace<ClientToServerEvents, ServerToClientEvents>
): void {
  roomNsp.on('connection', (socket: RoomSocket) => {
    const userId = socket.data.userId as string;

    // join_room 事件
    socket.on('join_room', async (data) => {
      try {
        const { campaign_id, character_id, last_event_id } = data;

        // 校验用户是否为该 campaign 的 GM 或成员
        const campaign = await db('campaigns').where({ id: campaign_id }).first();
        if (!campaign) {
          socket.emit('error_message', { message: '战役不存在' });
          return;
        }
        const isGm = campaign.gm_user_id === userId;
        if (!isGm) {
          const member = await db('character_scene_states as css')
            .join('character_sheets as cs', 'cs.id', 'css.character_id')
            .where('css.campaign_id', campaign_id)
            .where('cs.user_id', userId)
            .first();
          if (!member) {
            socket.emit('error_message', { message: '无权加入该房间' });
            return;
          }
        }

        // 校验 character_id 归属
        if (character_id) {
          const sheet = await db('character_sheets')
            .where({ id: character_id, user_id: userId })
            .first();
          if (!sheet) {
            socket.emit('error_message', { message: '角色不属于当前用户' });
            return;
          }
        }

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

      // ── 指令消息处理 ──────────────────────────────────────────────────────
      if (data.message_type === 'command') {
        await handleCommandMessage(
          roomNsp, campaignId, characterId, userId, data.content, data.metadata
        );
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

      // 自动计算 visible_to（若客户端未显式指定）
      if (!data.visible_to) {
        const msgType = message.message_type;
        // OOC / system / announcement → 全体可见（visible_to = null）
        if (msgType === 'ooc' || msgType === 'system' || msgType === 'announcement') {
          message.visible_to = null;
        } else if (data.metadata?.gm_hidden) {
          // GM 隐藏消息 → 只有 GM 可见
          const campaignRow2 = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first().catch(() => null);
          message.visible_to = campaignRow2 ? [campaignRow2.gm_user_id] : null;
        } else {
          message.visible_to = await computeVisibleTo(sceneId, campaignId, message.created_at).catch(() => null);
        }
      }

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

      // 定向广播：visible_to 为 null → 全体广播；否则只发给可见用户
      if (message.visible_to === null) {
        roomNsp.to(`campaign:${campaignId}`).emit('new_message', message);
      } else {
        // 获取团的 GM 用户 ID
        const campaignRow = await db('campaigns')
          .where({ id: campaignId })
          .select('gm_user_id')
          .first()
          .catch(() => null);
        const gmUserId = campaignRow?.gm_user_id as string | undefined;

        // 将角色 ID 列表转换为用户 ID 列表（含 GM）
        const visibleUserIds = await characterIdsToUserIds(
          message.visible_to,
          gmUserId ?? userId
        );
        // 发送者也一定能看到自己的消息
        if (!visibleUserIds.includes(userId)) visibleUserIds.push(userId);

        // 向每个可见用户的 socket 发送消息
        await Promise.all(
          visibleUserIds.map(async (uid) => {
            const socketId = await redis.get(RedisKeys.userSocket(uid));
            if (socketId) {
              roomNsp.to(socketId).emit('new_message', message);
            }
          })
        );
      }
      } catch (err) {
        console.error('[chat_message] handler error:', err);
      }
    });

    // GM 宣布剧情时间（插入 time_tag 消息到聊天流）
    socket.on('gm_announce_time', async (data) => {
      try {
        const campaignId = socket.data.campaignId as string;
        if (!campaignId) return;

        const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
        if (!campaign || campaign.gm_user_id !== userId) return;

        // 获取 GM 当前所在场景（作为 time_tag 消息归属场景）
        const gmState = await db('character_scene_states')
          .where({ campaign_id: campaignId })
          .join('character_sheets', 'character_sheets.id', 'character_scene_states.character_id')
          .where('character_sheets.user_id', userId)
          .select('character_scene_states.current_spatial_scene_id')
          .first()
          .catch(() => null);

        // 若 GM 不在任何场景，用第一个非大厅场景或留空字符串
        const sceneId = gmState?.current_spatial_scene_id ?? '';

        const { messageId, timeLabel } = await announceTime(campaignId, sceneId, data.time_label, userId);

        // 构建消息对象广播到全体
        const message = {
          id: messageId,
          scene_id: sceneId,
          campaign_id: campaignId,
          sender_user_id: userId,
          sender_character_id: null,
          content: timeLabel,
          message_type: 'time_tag' as const,
          story_time: null,
          visible_to: null,
          client_timestamp: Date.now(),
          created_at: new Date(),
          metadata: null,
        };

        // 推入 Redis 消息缓冲区
        await redis.lpush(RedisKeys.messageBuffer(campaignId), JSON.stringify(message));
        await redis.ltrim(RedisKeys.messageBuffer(campaignId), 0, 199);

        // 广播消息
        roomNsp.to(`campaign:${campaignId}`).emit('new_message', message);
        roomNsp.to(`campaign:${campaignId}`).emit('time_tag_announced', { time_label: timeLabel, message_id: messageId });
      } catch (err) {
        console.error('[gm_announce_time] handler error:', err);
      }
    });

    // 玩家申请移动
    socket.on('request_move', async (data) => {
      try {
        const { target_scene_id } = data;
        const campaignId = socket.data.campaignId as string;
        const characterId = socket.data.characterId as string;
        if (!characterId || !campaignId) return;

        const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();

        const moveId = generateId();
        await db('scheduled_moves').insert({
          id: moveId,
          character_id: characterId,
          campaign_id: campaignId,
          to_scene_id: target_scene_id,
          execute_at_story: null,
          status: 'pending',
        });

        if (campaign?.gm_user_id) {
          const gmSocketId = await redis.get(RedisKeys.userSocket(campaign.gm_user_id));
          if (gmSocketId) {
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

    // GM 批准移动（立即执行 → 角色瞬间到达目标场景）
    socket.on('gm_approve_move', async (data) => {
      try {
        const { move_id, story_arrival_time } = data;
        const move = await db('scheduled_moves').where({ id: move_id, status: 'pending' }).first();
        if (!move) return;

        // 校验 GM 身份
        const approveCampaign = await db('campaigns').where({ id: move.campaign_id }).first();
        if (!approveCampaign || approveCampaign.gm_user_id !== userId) return;

        const { record, from_scene_id } = await approveMove(move_id, userId, story_arrival_time ?? null);
        if (!record) return;

        // 构建系统过渡消息（插入当前场景聊天流）
        const toScene = await db('scenes').where({ id: move.to_scene_id }).select('name').first().catch(() => null);
        const fromScene = from_scene_id ? await db('scenes').where({ id: from_scene_id }).select('name').first().catch(() => null) : null;
        const charSheet = await db('character_sheets').where({ id: move.character_id }).select('user_id', 'name').first().catch(() => null);

        const transitionContent = fromScene
          ? `${charSheet?.name ?? '角色'} 离开 ${fromScene.name}，前往 ${toScene?.name ?? '目标场景'}`
          : `${charSheet?.name ?? '角色'} 前往 ${toScene?.name ?? '目标场景'}`;
        const sysMsg = {
          id: String(snowflake.nextId()),
          scene_id: move.to_scene_id,
          campaign_id: move.campaign_id,
          sender_user_id: userId,
          sender_character_id: null,
          content: transitionContent,
          message_type: 'system' as const,
          story_time: null,
          visible_to: null,
          client_timestamp: Date.now(),
          created_at: new Date(),
          metadata: null,
        };
        await db('chat_messages').insert({ ...sysMsg, id: BigInt(sysMsg.id) });
        await redis.lpush(RedisKeys.messageBuffer(move.campaign_id), JSON.stringify(sysMsg));
        await redis.ltrim(RedisKeys.messageBuffer(move.campaign_id), 0, 199);
        roomNsp.to(`campaign:${move.campaign_id}`).emit('new_message', sysMsg);

        // 通知玩家移动已执行
        if (charSheet?.user_id) {
          const playerSocketId = await redis.get(RedisKeys.userSocket(charSheet.user_id));
          if (playerSocketId) {
            roomNsp.to(playerSocketId).emit('move_approved', {
              move_id,
              to_scene_id: move.to_scene_id,
              from_scene_id,
            });
          }
          notificationService.createNotification({
            userId: charSheet.user_id as string,
            type: 'system',
            title: '移动已执行',
            content: `你已抵达 ${toScene?.name ?? '目标场景'}`,
            metadata: { move_id },
          }).catch(() => {});
        }

        // 广播位置变更
        roomNsp.to(`campaign:${move.campaign_id}`).emit('position_changed', {
          character_id: move.character_id,
          from_scene_id: from_scene_id ?? '',
          to_scene_id: move.to_scene_id,
          move_type: 'scheduled',
        });
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

        // 校验 GM 身份
        const rejectCampaign = await db('campaigns').where({ id: move.campaign_id }).first();
        if (!rejectCampaign || rejectCampaign.gm_user_id !== userId) return;

        await db('scheduled_moves').where({ id: move_id }).update({ status: 'cancelled' });

        const charSheet = await db('character_sheets').where({ id: move.character_id }).select('user_id').first();
        if (charSheet?.user_id) {
          const playerSocketId = await redis.get(RedisKeys.userSocket(charSheet.user_id));
          if (playerSocketId) {
            roomNsp.to(playerSocketId).emit('move_rejected', { move_id });
          }
          notificationService.createNotification({
            userId: charSheet.user_id as string,
            type: 'system',
            title: '移动请求已拒绝',
            content: 'GM拒绝了你的移动请求。',
            metadata: { move_id },
          }).catch(() => {});
        }
      } catch (err) {
        console.error('[gm_reject_move] handler error:', err);
      }
    });

    socket.on('grid_token_moved', async (data) => {
      try {
        const campaignId = socket.data.campaignId as string;
        if (!campaignId || campaignId !== data.campaign_id) return;

        const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
        if (!campaign || campaign.gm_user_id !== userId) return;

        const currentMap = await db('campaign_grid_maps')
          .where({ campaign_id: campaignId, scene_id: data.scene_id })
          .first();

        const currentTokens = currentMap?.tokens
          ? (typeof currentMap.tokens === 'string' ? JSON.parse(currentMap.tokens) : currentMap.tokens)
          : [];

        const nextTokens = Array.isArray(currentTokens)
          ? currentTokens.map((token) => (token.id === data.token.id ? data.token : token))
          : [data.token];

        if (!Array.isArray(currentTokens) || !currentTokens.some((token) => token.id === data.token.id)) {
          nextTokens.push(data.token);
        }

        if (currentMap) {
          await db('campaign_grid_maps')
            .where({ campaign_id: campaignId, scene_id: data.scene_id })
            .update({ tokens: JSON.stringify(nextTokens), updated_at: db.fn.now() });
        }

        roomNsp.to(`campaign:${campaignId}`).emit('grid_token_moved', {
          campaign_id: campaignId,
          scene_id: data.scene_id,
          token: data.token,
        });
      } catch (err) {
        console.error('[grid_token_moved] handler error:', err);
      }
    });

    socket.on('grid_area_marked', async (data) => {
      try {
        const campaignId = socket.data.campaignId as string;
        if (!campaignId || campaignId !== data.campaign_id) return;

        const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
        if (!campaign || campaign.gm_user_id !== userId) return;

        const overlays = Array.isArray(data.overlays) ? data.overlays : [];
        await db('campaign_grid_maps')
          .where({ campaign_id: campaignId, scene_id: data.scene_id })
          .update({ overlays: JSON.stringify(overlays), updated_at: db.fn.now() });

        roomNsp.to(`campaign:${campaignId}`).emit('grid_area_marked', {
          campaign_id: campaignId,
          scene_id: data.scene_id,
          overlays,
        });
      } catch (err) {
        console.error('[grid_area_marked] handler error:', err);
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

// ── 指令消息处理辅助函数 ──────────────────────────────────────────────────

async function handleCommandMessage(
  roomNsp: Namespace<ClientToServerEvents, ServerToClientEvents>,
  campaignId: string,
  characterId: string,
  userId: string,
  commandStr: string,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  try {
    // 获取团的 ruleset_id 和全局故事时间
    const campaign = await db('campaigns')
      .where({ id: campaignId })
      .select('ruleset_id', 'global_story_time', 'gm_user_id')
      .first();

    if (!campaign?.ruleset_id) {
      // 没有关联规则集，退回为普通叙述消息
      await broadcastTextFallback(roomNsp, campaignId, characterId, userId, commandStr, metadata);
      return;
    }

    // 通过 rulesetService 执行指令（含三层解析 + 角色数据注入）
    let execResult;
    try {
      execResult = await rulesetService.executeCommand(campaign.ruleset_id as string, {
        command: commandStr,
        context: characterId ? { character_id: characterId, campaign_id: campaignId } : undefined,
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'NOT_FOUND') {
        // 命令未找到，作为普通文本发送
        await broadcastTextFallback(roomNsp, campaignId, characterId, userId, commandStr, metadata);
        return;
      }
      throw err;
    }

    // 解析故事时间
    let storyTime: StoryTime | null = null;
    if (campaign.global_story_time) {
      try {
        storyTime = typeof campaign.global_story_time === 'string'
          ? JSON.parse(campaign.global_story_time)
          : campaign.global_story_time;
      } catch { /* ignore */ }
    }

    // 获取角色所在场景
    let sceneId = '';
    if (characterId) {
      const sceneState = await db('character_scene_states')
        .where({ character_id: characterId, campaign_id: campaignId })
        .select('current_spatial_scene_id')
        .first()
        .catch(() => null);
      sceneId = sceneState?.current_spatial_scene_id ?? '';
    }

    // 构建骰子消息
    const messageId = snowflake.nextId();
    const diceLines = execResult.dice_rolls.map((r) =>
      `[${r.expression}] = ${r.value}${r.detail ? ` (${r.detail})` : ''}`
    );
    let resultLine = execResult.result;

    // ── en 技能成长：检定通过后自动写回角色卡 ─────────────────────────────────
    if (execResult.command_name === 'en' && characterId && execResult.success) {
      const rawOut = execResult.raw_output as Record<string, unknown> | null;
      const growthPassed = rawOut && typeof rawOut['passed'] === 'boolean' ? rawOut['passed'] : false;
      if (growthPassed) {
        // dice_rolls[0] = 成长检定骰（1d100），dice_rolls[1] = 成长骰（1d10）
        const growthAmount = execResult.dice_rolls[1]?.value ?? 0;
        // 从指令字符串中解析技能名（"en 侦查" → "侦查"）
        const skillName = commandStr.replace(/^en\s+/i, '').trim();
        if (skillName && growthAmount > 0) {
          try {
            // 读取当前技能值
            const charRow = await db('character_sheets')
              .where({ id: characterId })
              .select('skills')
              .first();
            const skills: Record<string, number> = charRow?.skills
              ? (typeof charRow.skills === 'string' ? JSON.parse(charRow.skills) : charRow.skills)
              : {};
            const oldValue = skills[skillName] ?? 0;
            const newValue = Math.min(99, oldValue + growthAmount);
            // 写回 DB
            await characterInstanceService.growSkill(characterId, campaignId, skillName, newValue);
            resultLine = `成功（${skillName} ${oldValue} → ${newValue}）`;
          } catch {
            // 写回失败不影响消息广播，仅记录
            resultLine = `成功（成长 +${growthAmount}，角色卡同步失败）`;
          }
        }
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const displayContent = [
      `> ${commandStr}`,
      ...diceLines,
      resultLine,
    ].join('\n');

    const diceMessage: ChatMessage = {
      id: messageId,
      scene_id: sceneId,
      campaign_id: campaignId,
      sender_user_id: userId,
      sender_character_id: characterId || null,
      content: displayContent,
      message_type: 'dice',
      story_time: storyTime,
      visible_to: null,
      client_timestamp: Date.now(),
      created_at: new Date(),
      metadata: {
        ...(metadata ?? {}),
        command: commandStr,
        dice_rolls: execResult.dice_rolls,
        result: execResult.result,
        success: execResult.success,
      },
    };

    // 写入 DB
    await db('chat_messages').insert({
      id: BigInt(diceMessage.id),
      scene_id: diceMessage.scene_id,
      campaign_id: diceMessage.campaign_id,
      sender_user_id: diceMessage.sender_user_id,
      sender_character_id: diceMessage.sender_character_id,
      content: diceMessage.content,
      message_type: diceMessage.message_type,
      story_time: diceMessage.story_time ? JSON.stringify(diceMessage.story_time) : null,
      visible_to: null,
      client_timestamp: diceMessage.client_timestamp,
      created_at: diceMessage.created_at,
      metadata: JSON.stringify(diceMessage.metadata),
    });

    await redis.lpush(RedisKeys.messageBuffer(campaignId), JSON.stringify(diceMessage));
    await redis.ltrim(RedisKeys.messageBuffer(campaignId), 0, 199);

    // 全团广播
    roomNsp.to(`campaign:${campaignId}`).emit('new_message', diceMessage);
  } catch (err) {
    console.error('[handleCommandMessage] error:', err);
  }
}

/** 命令未识别时作为普通叙述文本发送 */
async function broadcastTextFallback(
  roomNsp: Namespace<ClientToServerEvents, ServerToClientEvents>,
  campaignId: string,
  characterId: string,
  userId: string,
  content: string,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  const messageId = snowflake.nextId();
  const fallbackMsg: ChatMessage = {
    id: messageId,
    scene_id: '',
    campaign_id: campaignId,
    sender_user_id: userId,
    sender_character_id: characterId || null,
    content,
    message_type: 'narrative',
    story_time: null,
    visible_to: null,
    client_timestamp: Date.now(),
    created_at: new Date(),
    metadata: metadata ?? null,
  };
  await db('chat_messages').insert({
    id: BigInt(fallbackMsg.id),
    scene_id: fallbackMsg.scene_id,
    campaign_id: fallbackMsg.campaign_id,
    sender_user_id: fallbackMsg.sender_user_id,
    sender_character_id: fallbackMsg.sender_character_id,
    content: fallbackMsg.content,
    message_type: fallbackMsg.message_type,
    story_time: null,
    visible_to: null,
    client_timestamp: fallbackMsg.client_timestamp,
    created_at: fallbackMsg.created_at,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
  roomNsp.to(`campaign:${campaignId}`).emit('new_message', fallbackMsg);
}
