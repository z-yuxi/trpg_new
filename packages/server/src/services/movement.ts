/**
 * movement.ts
 * 角色移动管理：预约移动 / 审批 / 拒绝 / 强制移动
 */
import type { StoryTime } from '@trpg/shared';
import { generateId } from '@trpg/shared';
import { db } from '../db';
import { joinScene } from './scene-participation';

export interface ScheduledMoveRecord {
  id: string;
  character_id: string;
  campaign_id: string;
  to_scene_id: string;
  execute_at_story: StoryTime;
  status: 'pending' | 'approved' | 'executed' | 'cancelled';
  created_at: Date;
  character_name?: string;
  to_scene_name?: string;
}

/**
 * 玩家预约移动（创建 pending 记录）
 */
export async function requestMove(
  characterId: string,
  campaignId: string,
  toSceneId: string,
  executeAtStory: StoryTime
): Promise<ScheduledMoveRecord> {
  const id = generateId();
  await db('scheduled_moves').insert({
    id,
    character_id: characterId,
    campaign_id: campaignId,
    to_scene_id: toSceneId,
    execute_at_story: JSON.stringify(executeAtStory),
    status: 'pending',
  });
  return getMoveById(id) as Promise<ScheduledMoveRecord>;
}

/**
 * GM 批准移动
 */
export async function approveMove(moveId: string, _gmUserId: string): Promise<ScheduledMoveRecord | null> {
  await db('scheduled_moves').where({ id: moveId, status: 'pending' }).update({ status: 'approved' });
  return getMoveById(moveId);
}

/**
 * GM 拒绝移动
 */
export async function rejectMove(moveId: string, _gmUserId: string): Promise<ScheduledMoveRecord | null> {
  await db('scheduled_moves').where({ id: moveId }).whereIn('status', ['pending', 'approved']).update({ status: 'cancelled' });
  return getMoveById(moveId);
}

/**
 * GM 强制立即移动角色（不需审批，立即执行）
 */
export async function forceMove(
  characterId: string,
  toSceneId: string,
  campaignId: string,
  _gmUserId: string
): Promise<{ from_scene_id: string | null; to_scene_id: string }> {
  const state = await db('character_scene_states')
    .where({ character_id: characterId, campaign_id: campaignId })
    .select('current_spatial_scene_id')
    .first()
    .catch(() => null);
  const fromSceneId: string | null = state?.current_spatial_scene_id ?? null;

  await joinScene(characterId, campaignId, toSceneId, 'force_move');

  return { from_scene_id: fromSceneId, to_scene_id: toSceneId };
}

/**
 * 获取团的移动列表
 */
export async function listMoves(campaignId: string, status?: string): Promise<ScheduledMoveRecord[]> {
  let q = db('scheduled_moves as sm')
    .leftJoin('character_sheets as cs', 'cs.id', 'sm.character_id')
    .leftJoin('scenes as s', 's.id', 'sm.to_scene_id')
    .where('sm.campaign_id', campaignId)
    .select(
      'sm.id', 'sm.character_id', 'sm.campaign_id', 'sm.to_scene_id',
      'sm.execute_at_story', 'sm.status', 'sm.created_at',
      'cs.name as character_name', 's.name as to_scene_name'
    )
    .orderBy('sm.created_at', 'asc');
  if (status) q = q.where('sm.status', status);
  const rows = await q;
  return rows.map((r: any) => ({
    ...r,
    execute_at_story: typeof r.execute_at_story === 'string' ? JSON.parse(r.execute_at_story) : r.execute_at_story,
  }));
}

async function getMoveById(id: string): Promise<ScheduledMoveRecord | null> {
  const row = await db('scheduled_moves as sm')
    .leftJoin('character_sheets as cs', 'cs.id', 'sm.character_id')
    .leftJoin('scenes as s', 's.id', 'sm.to_scene_id')
    .where('sm.id', id)
    .select(
      'sm.id', 'sm.character_id', 'sm.campaign_id', 'sm.to_scene_id',
      'sm.execute_at_story', 'sm.status', 'sm.created_at',
      'cs.name as character_name', 's.name as to_scene_name'
    )
    .first()
    .catch(() => null);
  if (!row) return null;
  return {
    ...row,
    execute_at_story: typeof row.execute_at_story === 'string' ? JSON.parse(row.execute_at_story) : row.execute_at_story,
  };
}
