/**
 * movement.ts
 * 角色移动管理：移动申请 / 立即审批执行 / 拒绝 / 强制移动
 *
 * 设计说明：
 * - GM 批准 → 立即执行移动（不依赖时间推进触发）
 * - story_arrival_time 为可选字段（HH:MM 格式），记录在 position_history.story_time_entered
 * - execute_at_story 字段保留兼容性，但新逻辑不再用于定时触发
 */
import { generateId } from '@trpg/shared';
import { db } from '../db';
import { joinScene } from './scene-participation';

export interface ScheduledMoveRecord {
  id: string;
  character_id: string;
  campaign_id: string;
  to_scene_id: string;
  execute_at_story: null;  // 已废弃，保留兼容性
  status: 'pending' | 'approved' | 'executed' | 'cancelled';
  created_at: Date;
  character_name?: string;
  to_scene_name?: string;
}

/**
 * 玩家申请移动（创建 pending 记录）
 */
export async function requestMove(
  characterId: string,
  campaignId: string,
  toSceneId: string,
): Promise<ScheduledMoveRecord> {
  const id = generateId();
  await db('scheduled_moves').insert({
    id,
    character_id: characterId,
    campaign_id: campaignId,
    to_scene_id: toSceneId,
    execute_at_story: null,
    status: 'pending',
  });
  return getMoveById(id) as Promise<ScheduledMoveRecord>;
}

/**
 * GM 批准移动 → 立即执行
 * @param storyArrivalTime 可选，HH:MM 格式的剧情到达时间，写入 position_history.story_time_entered
 */
export async function approveMove(
  moveId: string,
  _gmUserId: string,
  storyArrivalTime?: string | null,
): Promise<{ record: ScheduledMoveRecord | null; from_scene_id: string | null }> {
  const move = await db('scheduled_moves').where({ id: moveId, status: 'pending' }).first();
  if (!move) return { record: null, from_scene_id: null };

  // 获取当前所在场景
  const state = await db('character_scene_states')
    .where({ character_id: move.character_id, campaign_id: move.campaign_id })
    .select('current_spatial_scene_id')
    .first()
    .catch(() => null);
  const fromSceneId: string | null = state?.current_spatial_scene_id ?? null;

  // 解析剧情时间（HH:MM → { hour, minute }，day 默认 null）
  let storyTimeJson: string | null = null;
  if (storyArrivalTime) {
    const match = storyArrivalTime.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      storyTimeJson = JSON.stringify({
        hour: parseInt(match[1], 10),
        minute: parseInt(match[2], 10),
      });
    }
  }

  // 立即执行移动（joinScene 内部会记录 position_history）
  await joinScene(move.character_id, move.campaign_id, move.to_scene_id, 'scheduled', storyTimeJson);

  // 标记为已执行
  await db('scheduled_moves').where({ id: moveId }).update({ status: 'executed' });

  return { record: await getMoveById(moveId), from_scene_id: fromSceneId };
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
  return rows.map((r: any) => ({ ...r, execute_at_story: null }));
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
  return { ...row, execute_at_story: null };
}
