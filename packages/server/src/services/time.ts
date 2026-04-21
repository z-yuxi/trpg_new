/**
 * time.ts
 * 时间相关服务
 *
 * 设计说明（时间系统重构后）：
 * - 无自动时间推进，GM 手动宣布剧情时间
 * - announceTime: GM 宣布时间 → 在聊天流中插入 time_tag 消息
 * - 保留工具函数供其他模块使用
 */
import type { StoryTime } from '@trpg/shared';
import { snowflake } from '@trpg/shared';
import { db } from '../db';

export function addTime(base: StoryTime, delta: { day?: number; hour?: number; minute?: number }): StoryTime {
  let totalMinutes =
    base.day * 24 * 60 +
    base.hour * 60 +
    base.minute +
    (delta.day ?? 0) * 24 * 60 +
    (delta.hour ?? 0) * 60 +
    (delta.minute ?? 0);
  if (totalMinutes < 0) totalMinutes = 0;
  const day = Math.floor(totalMinutes / (24 * 60));
  const hour = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minute = totalMinutes % 60;
  return { day, hour, minute };
}

export function storyTimeToMinutes(t: StoryTime): number {
  return t.day * 24 * 60 + t.hour * 60 + t.minute;
}

export function compareStoryTime(a: StoryTime, b: StoryTime): number {
  return storyTimeToMinutes(a) - storyTimeToMinutes(b);
}

/**
 * GM 宣布剧情时间
 * - 在当前场景聊天流中插入一条 time_tag 类型的消息
 * - 更新 campaigns.global_story_time（仅 hour/minute；day 字段保留向后兼容）
 * @param campaignId 战役ID
 * @param sceneId 当前活跃场景ID（time_tag 消息的归属场景）
 * @param timeLabel HH:MM 格式的时间字符串，如 "14:30"
 * @param gmUserId GM用户ID
 * @returns 插入的 time_tag 消息ID
 */
export async function announceTime(
  campaignId: string,
  sceneId: string,
  timeLabel: string,
  gmUserId: string,
): Promise<{ messageId: string; timeLabel: string }> {
  // 验证 HH:MM 格式
  const match = timeLabel.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error('Invalid time format, expected HH:MM');

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour > 23 || minute > 59) throw new Error('Invalid time value');

  // 更新 campaigns.global_story_time（保留当前 day，只更新 hour/minute）
  const campaign = await db('campaigns').where({ id: campaignId }).select('global_story_time').first();
  let currentDay = 0;
  try {
    const current = typeof campaign?.global_story_time === 'string'
      ? JSON.parse(campaign.global_story_time)
      : campaign?.global_story_time;
    currentDay = current?.day ?? 0;
  } catch { /* 默认 day=0 */ }

  await db('campaigns').where({ id: campaignId }).update({
    global_story_time: JSON.stringify({ day: currentDay, hour, minute }),
  });

  // 插入 time_tag 消息到聊天流
  const messageId = String(snowflake.nextId());
  await db('chat_messages').insert({
    id: BigInt(messageId),
    scene_id: sceneId,
    campaign_id: campaignId,
    sender_user_id: gmUserId,
    sender_character_id: null,
    content: timeLabel,               // 消息内容就是 HH:MM 字符串
    message_type: 'time_tag',
    story_time: JSON.stringify({ day: currentDay, hour, minute }),
    visible_to: null,                 // 全体可见
    client_timestamp: Date.now(),
    created_at: new Date(),
    metadata: null,
  });

  return { messageId, timeLabel };
}
