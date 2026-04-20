/**
 * scene-participation.ts
 * 场景参与管理：进入/离开场景，更新 character_scene_states，广播 system 消息
 */
import { generateId } from '@trpg/shared';
import { db } from '../db';

export interface ParticipantInfo {
  character_id: string;
  character_name: string;
  user_id: string;
}

/**
 * 角色进入场景
 * - 更新 character_scene_states.current_spatial_scene_id
 * - 插入 scene_participations 记录（若不存在）
 * - 插入 position_history 记录
 */
export async function joinScene(
  characterId: string,
  campaignId: string,
  sceneId: string,
  moveType: 'join' | 'scheduled' | 'force_move' = 'join'
): Promise<void> {
  // 更新场景状态
  await db('character_scene_states')
    .where({ character_id: characterId, campaign_id: campaignId })
    .update({ current_spatial_scene_id: sceneId });

  // 插入或更新 scene_participations（仅当不存在有效记录时）
  const existing = await db('scene_participations')
    .where({ scene_id: sceneId, character_id: characterId })
    .whereNull('left_at')
    .first()
    .catch(() => null);

  if (!existing) {
    await db('scene_participations').insert({
      id: generateId(),
      scene_id: sceneId,
      character_id: characterId,
      joined_at: db.fn.now(),
      left_at: null,
    });
  }

  // 插入 position_history
  const campaign = await db('campaigns').where({ id: campaignId }).select('global_story_time').first().catch(() => null);
  const storyTime = campaign?.global_story_time ?? null;
  await db('position_history').insert({
    id: generateId(),
    campaign_id: campaignId,
    character_id: characterId,
    scene_id: sceneId,
    story_time_entered: storyTime ? (typeof storyTime === 'string' ? storyTime : JSON.stringify(storyTime)) : null,
    story_time_left: null,
    move_type: moveType,
  });
}

/**
 * 角色离开场景
 * - 更新 scene_participations.left_at
 * - 更新 position_history.story_time_left
 */
export async function leaveScene(
  characterId: string,
  campaignId: string,
  sceneId: string
): Promise<void> {
  // 更新 scene_participations
  await db('scene_participations')
    .where({ scene_id: sceneId, character_id: characterId })
    .whereNull('left_at')
    .update({ left_at: db.fn.now() });

  // 更新 position_history 最新记录的 story_time_left
  const campaign = await db('campaigns').where({ id: campaignId }).select('global_story_time').first().catch(() => null);
  const storyTime = campaign?.global_story_time ?? null;
  const latestHistory = await db('position_history')
    .where({ character_id: characterId, scene_id: sceneId, campaign_id: campaignId })
    .whereNull('story_time_left')
    .orderBy('created_at', 'desc')
    .first()
    .catch(() => null);
  if (latestHistory) {
    await db('position_history')
      .where({ id: latestHistory.id })
      .update({
        story_time_left: storyTime ? (typeof storyTime === 'string' ? storyTime : JSON.stringify(storyTime)) : null,
      });
  }
}

/**
 * 获取场景当前参与者列表
 */
export async function getParticipants(sceneId: string): Promise<ParticipantInfo[]> {
  const rows = await db('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .where('css.current_spatial_scene_id', sceneId)
    .select('css.character_id', 'cs.name as character_name', 'cs.user_id');
  return rows.map((r: any) => ({
    character_id: r.character_id,
    character_name: r.character_name,
    user_id: r.user_id,
  }));
}
