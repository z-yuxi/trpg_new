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
 * @param storyTimeJson 可选，JSON字符串格式的剧情到达时间（由GM批准时传入）
 */
export async function joinScene(
  characterId: string,
  campaignId: string,
  sceneId: string,
  moveType: 'join' | 'scheduled' | 'force_move' = 'join',
  storyTimeJson?: string | null,
): Promise<void> {
  const currentState = await db('character_scene_states')
    .where({ character_id: characterId, campaign_id: campaignId })
    .select('current_spatial_scene_id')
    .first()
    .catch(() => null);

  const previousSceneId: string | null = currentState?.current_spatial_scene_id ?? null;
  if (previousSceneId === sceneId) {
    return;
  }

  // 先结束旧场景停留，确保 position_history.story_time_left 被正确补齐
  if (previousSceneId) {
    await leaveScene(characterId, campaignId, previousSceneId);
  }

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
  // 优先使用传入的 storyTimeJson（GM批准时的剧情时间），否则为 null
  await db('position_history').insert({
    id: generateId(),
    campaign_id: campaignId,
    character_id: characterId,
    scene_id: sceneId,
    story_time_entered: storyTimeJson ?? null,
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

// ─── 跨场权限规则 ──────────────────────────────────────────────────────────────

export interface CanJoinSceneResult {
  allowed: boolean;
  /** 拦截原因（allowed=false 时） */
  reason?: 'locked' | 'requires_approval' | 'already_in_scene' | 'not_a_member';
  /** 是否需要走移动申请流程（allowed=false, reason=requires_approval） */
  needsApproval?: boolean;
}

/**
 * 检查角色是否可以进入指定场景（跨场权限规则，附录 M）
 *
 * 规则优先级（由高到低）：
 *   1. GM 强制移动 → 始终允许（isGmForce=true 时跳过所有检查）
 *   2. 'locked' 策略 → 拒绝（非 GM 强制）
 *   3. 'gm_approve' 策略 → 需要申请（返回 needsApproval=true）
 *   4. 'open' 策略 → 允许（需确认是团成员）
 */
export async function canJoinScene(
  characterId: string,
  campaignId: string,
  targetSceneId: string,
  options?: { isGmForce?: boolean },
): Promise<CanJoinSceneResult> {
  const isGmForce = options?.isGmForce ?? false;

  // GM 强制移动绕过策略
  if (isGmForce) return { allowed: true };

  // 确认角色是团成员
  const state = await db('character_scene_states')
    .where({ character_id: characterId, campaign_id: campaignId })
    .first()
    .catch(() => null);
  if (!state) return { allowed: false, reason: 'not_a_member' };

  // 已在目标场景
  if (state.current_spatial_scene_id === targetSceneId) {
    return { allowed: false, reason: 'already_in_scene' };
  }

  // 查场景策略
  const scene = await db('scenes')
    .where({ id: targetSceneId, campaign_id: campaignId })
    .select('access_policy')
    .first()
    .catch(() => null);

  const policy: string = scene?.access_policy ?? 'open';

  if (policy === 'locked') {
    return { allowed: false, reason: 'locked' };
  }
  if (policy === 'gm_approve') {
    return { allowed: false, reason: 'requires_approval', needsApproval: true };
  }
  // 'open'
  return { allowed: true };
}

/**
 * 修复历史数据：补齐 position_history.story_time_left = NULL 的开放记录
 *
 * 通常在服务重启或日常 cron 中调用，避免轨迹矩阵出现"未离开"的幽灵记录。
 * 策略：用当前该角色所在场景的 global_story_time 回写（近似值）。
 *
 * 返回修复的记录数。
 */
export async function repairOpenPositionHistory(): Promise<number> {
  // 查找所有 story_time_left IS NULL 且 scene_id ≠ 当前所在场景 的记录
  const openRows = await db('position_history as ph')
    .join('character_scene_states as css', function () {
      this.on('css.character_id', '=', 'ph.character_id')
          .andOn('css.campaign_id', '=', 'ph.campaign_id');
    })
    .whereNull('ph.story_time_left')
    .whereRaw('ph.scene_id != COALESCE(css.current_spatial_scene_id, \'\')')
    .select('ph.id', 'ph.campaign_id')
    .catch(() => [] as Array<{ id: string; campaign_id: string }>);

  if (openRows.length === 0) return 0;

  // 批量按 campaign 分组，用 global_story_time 回写
  const campaignIds = [...new Set((openRows as Array<{ id: string; campaign_id: string }>).map((r) => r.campaign_id))];
  const campaigns = await db('campaigns')
    .whereIn('id', campaignIds)
    .select('id', 'global_story_time')
    .catch(() => []);

  const storyTimeMap = new Map<string, string>(
    (campaigns as Array<{ id: string; global_story_time: unknown }>).map((c) => [
      c.id,
      typeof c.global_story_time === 'string' ? c.global_story_time : JSON.stringify(c.global_story_time),
    ]),
  );

  let fixed = 0;
  for (const row of openRows as Array<{ id: string; campaign_id: string }>) {
    const st = storyTimeMap.get(row.campaign_id) ?? null;
    await db('position_history')
      .where({ id: row.id })
      .update({ story_time_left: st })
      .catch(() => null);
    fixed++;
  }
  return fixed;
}

