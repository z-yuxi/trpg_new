/**
 * time.ts
 * 故事时间推进 service
 */
import type { StoryTime } from '@trpg/shared';
import { db } from '../db';
import { joinScene } from './scene-participation';

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

function parseTime(v: unknown): StoryTime | null {
  try {
    if (!v) return null;
    if (typeof v === 'string') return JSON.parse(v) as StoryTime;
    if (typeof v === 'object') return v as StoryTime;
    return null;
  } catch { return null; }
}

export interface ExecutedMove {
  move_id: string;
  character_id: string;
  from_scene_id: string | null;
  to_scene_id: string;
}

/**
 * GM 推进团故事时间
 * - 更新 campaigns.global_story_time
 * - 执行到期的 scheduled_moves
 * - 返回已执行的移动列表（供 Socket.IO 广播）
 */
export async function advanceTime(
  campaignId: string,
  delta: { day?: number; hour?: number; minute?: number },
  _gmUserId: string
): Promise<{ newTime: StoryTime; executedMoves: ExecutedMove[] }> {
  const campaign = await db('campaigns').where({ id: campaignId }).select('global_story_time').first();
  const currentTime: StoryTime = parseTime(campaign?.global_story_time) ?? { day: 1, hour: 8, minute: 0 };
  const newTime = addTime(currentTime, delta);

  // 更新全局时间
  await db('campaigns').where({ id: campaignId }).update({
    global_story_time: JSON.stringify(newTime),
  });

  // 查询到期的 scheduled_moves (status='approved')
  const approvedMoves = await db('scheduled_moves')
    .where({ campaign_id: campaignId, status: 'approved' })
    .select('*');

  const executedMoves: ExecutedMove[] = [];
  const newTimeMinutes = storyTimeToMinutes(newTime);

  for (const move of approvedMoves) {
    const executeAt = parseTime(move.execute_at_story);
    if (!executeAt) continue;
    if (storyTimeToMinutes(executeAt) > newTimeMinutes) continue;

    // 获取当前场景
    const state = await db('character_scene_states')
      .where({ character_id: move.character_id, campaign_id: campaignId })
      .select('current_spatial_scene_id')
      .first()
      .catch(() => null);
    const fromSceneId: string | null = state?.current_spatial_scene_id ?? null;

    // 执行移动
    await joinScene(move.character_id, campaignId, move.to_scene_id, 'scheduled');

    // 标记为已执行
    await db('scheduled_moves').where({ id: move.id }).update({ status: 'executed' });

    executedMoves.push({
      move_id: move.id,
      character_id: move.character_id,
      from_scene_id: fromSceneId,
      to_scene_id: move.to_scene_id,
    });
  }

  return { newTime, executedMoves };
}
