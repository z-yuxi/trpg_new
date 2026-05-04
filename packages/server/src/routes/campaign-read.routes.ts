/**
 * campaign-read.routes.ts — 战役只读端点
 *
 * 职责：列表、详情、场景、消息历史、成员、角色、移动列表、线索查询。
 * 禁止：写数据、权限变更逻辑、直接 Socket.IO 推送。
 */

import { Router } from 'express';
import { campaignService, scheduledMoveService } from '../services/campaign-service';
import { clueService } from '../services/clue-service';
import {
  canManageSceneObPermission,
  listSceneActiveObPermissions,
  getSceneActiveObPermissionMap,
} from '../services/scene-ob-permission-service';
import { db } from '../db';
import { safeJsonParse } from '../utils/safe-json';
import { messageVisibilityPolicyService } from '../services/visibility/MessageVisibilityPolicyService';
import {
  ensureCampaignMember,
  listSceneConnections,
  parseStoryTime,
  toStoryMinutes,
  serverErr,
} from './campaign-utils';

export const campaignReadRouter = Router();

// GET /api/campaigns
campaignReadRouter.get('/', async (req, res) => {
  try {
    const campaigns = await campaignService.findByUserId(req.user!.id);
    res.json(campaigns);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id
campaignReadRouter.get('/:id', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  const campaign = await campaignService.findById(req.params.id);
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(campaign);
});

// GET /api/campaigns/:id/scenes
campaignReadRouter.get('/:id/scenes', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const scenes = await campaignService.listScenes(req.params.id);
    res.json(scenes);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/scenes/:sceneId/grid-map
campaignReadRouter.get('/:id/scenes/:sceneId/grid-map', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const map = await campaignService.getGridMap(req.params.id, req.params.sceneId);
    res.json(map);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/scenes/:sceneId/participants
campaignReadRouter.get('/:id/scenes/:sceneId/participants', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const { getParticipants } = await import('../services/scene-participation.js');
    const participants = await getParticipants(req.params.sceneId!);
    res.json(participants);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/scenes/:sceneId/ob-permissions
campaignReadRouter.get('/:id/scenes/:sceneId/ob-permissions', async (req, res) => {
  try {
    const scene = await db('scenes')
      .where({ id: req.params.sceneId, campaign_id: req.params.id })
      .first();
    if (!scene) { res.status(404).json({ error: 'SCENE_NOT_FOUND' }); return; }

    const canManage = await canManageSceneObPermission(req.params.sceneId, req.user!.id);
    if (!canManage) { res.status(403).json({ error: 'FORBIDDEN' }); return; }

    const permissions = await listSceneActiveObPermissions(req.params.sceneId);
    res.json(permissions);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/my-ob-permission-scenes
campaignReadRouter.get('/:id/my-ob-permission-scenes', async (req, res) => {
  try {
    const userId = req.user!.id;
    const obPermissionMap = await getSceneActiveObPermissionMap(req.params.id, userId);
    res.json(Array.from(obPermissionMap.keys()));
  } catch (err: unknown) {
    const status =
      typeof (err as Record<string, unknown>)?.status === 'number'
        ? ((err as Record<string, unknown>).status as number)
        : 500;
    console.error('[campaigns:myObPermissionScenes]', err instanceof Error ? err.message : err);
    res.status(status).json({ error: (err as Error).message ?? '加载旁听权限失败' });
  }
});

// GET /api/campaigns/:id/my-virtual-scenes
campaignReadRouter.get('/:id/my-virtual-scenes', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user!.id;
    const charRows = await db('character_sheets')
      .where({ user_id: userId })
      .join('character_scene_states', 'character_sheets.id', 'character_scene_states.character_id')
      .where('character_scene_states.campaign_id', campaignId)
      .select('character_sheets.id as char_id');
    const charIds = (charRows as { char_id: string }[]).map((r) => r.char_id);
    if (charIds.length === 0) { res.json([]); return; }

    const pRows = await db('scene_participations as sp')
      .join('scenes as s', 's.id', 'sp.scene_id')
      .whereIn('sp.character_id', charIds)
      .whereNull('sp.left_at')
      .where('s.type', 'virtual')
      .where('s.campaign_id', campaignId)
      .select('sp.scene_id');
    res.json([...new Set((pRows as { scene_id: string }[]).map((r) => r.scene_id))]);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/connections
campaignReadRouter.get('/:id/connections', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    res.json(await listSceneConnections(req.params.id));
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/scenes/connections (兼容旧路径)
campaignReadRouter.get('/:id/scenes/connections', async (req, res) => {
  try {
    res.json(await listSceneConnections(req.params.id));
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/npcs
campaignReadRouter.get('/:id/npcs', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    res.json(await db('campaign_npcs').where({ campaign_id: req.params.id }));
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/messages  ← 接入 MessageVisibilityPolicyService
campaignReadRouter.get('/:id/messages', async (req, res) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user!.id;

    const memberAuth = await ensureCampaignMember(campaignId, userId);
    if (!memberAuth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }

    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const isGm = campaign?.gm_user_id === userId;

    const filtered = await messageVisibilityPolicyService.applyPolicy(campaignId, userId, isGm, {
      sceneId: req.query.scene_id as string | undefined,
      afterId: req.query.after_id ? String(req.query.after_id) : undefined,
    });

    res.json(filtered);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/round-state
campaignReadRouter.get('/:id/round-state', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const state =
      (await db('campaign_round_state').where({ campaign_id: req.params.id }).first()) ?? null;
    res.json(state);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/position-history
campaignReadRouter.get('/:id/position-history', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const history = await db('position_history')
      .where({ campaign_id: req.params.id })
      .orderBy('created_at', 'desc');
    res.json(history);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/trajectory-matrix
campaignReadRouter.get('/:id/trajectory-matrix', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const campaignId = req.params.id;
    const [campaign, characters, historyRows] = await Promise.all([
      db('campaigns').where({ id: campaignId }).select('global_story_time').first(),
      db('character_scene_states as css')
        .join('character_sheets as cs', 'cs.id', 'css.character_id')
        .where('css.campaign_id', campaignId)
        .select('cs.id', 'cs.name')
        .orderBy('cs.created_at', 'asc'),
      db('position_history as ph')
        .leftJoin('scenes as s', 's.id', 'ph.scene_id')
        .where('ph.campaign_id', campaignId)
        .select(
          'ph.character_id',
          'ph.scene_id',
          'ph.story_time_entered',
          'ph.story_time_left',
          'ph.move_type',
          's.name as scene_name',
        )
        .orderBy('ph.created_at', 'asc'),
    ]);

    type MatrixEntry = {
      scene_id: string;
      scene_name: string;
      from_time: import('@trpg/shared').StoryTime;
      to_time: import('@trpg/shared').StoryTime | null;
      move_type: string;
    };
    const matrix: Record<string, MatrixEntry[]> = {};
    for (const char of characters as Array<{ id: string }>) matrix[char.id] = [];

    let minMinutes = Number.POSITIVE_INFINITY;
    let maxMinutes = Number.NEGATIVE_INFINITY;

    for (const row of historyRows as Array<Record<string, unknown>>) {
      const fromTime = parseStoryTime(row['story_time_entered']);
      const toTime = parseStoryTime(row['story_time_left']);
      if (!fromTime) continue;
      const fromMin = toStoryMinutes(fromTime);
      const toMin = toTime ? toStoryMinutes(toTime) : fromMin + 60;
      minMinutes = Math.min(minMinutes, fromMin);
      maxMinutes = Math.max(maxMinutes, toMin);
      const charId = String(row['character_id']);
      if (!matrix[charId]) matrix[charId] = [];
      matrix[charId]!.push({
        scene_id: String(row['scene_id']),
        scene_name: String(row['scene_name'] ?? row['scene_id']),
        from_time: fromTime,
        to_time: toTime,
        move_type: String(row['move_type'] ?? 'scheduled'),
      });
    }

    const fallbackNow =
      parseStoryTime(campaign?.global_story_time) ?? { day: 1, hour: 8, minute: 0 };
    if (!Number.isFinite(minMinutes)) {
      minMinutes = toStoryMinutes(fallbackNow);
      maxMinutes = minMinutes;
    }

    const axisStart = Math.floor(minMinutes / 60) * 60;
    const axisEnd = Math.ceil(maxMinutes / 60) * 60;
    const time_axis: Array<{ day: number; hour: number }> = [];
    for (let m = axisStart; m <= axisEnd; m += 60) {
      time_axis.push({ day: Math.floor(m / (24 * 60)) + 1, hour: Math.floor((m % (24 * 60)) / 60) });
    }

    res.json({
      time_axis,
      characters: (characters as Array<{ id: string; name: string }>).map((c) => ({
        id: c.id,
        name: c.name,
      })),
      matrix,
    });
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/members
campaignReadRouter.get('/:id/members', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    const gmUser = await db('users')
      .where({ id: campaign.gm_user_id })
      .select('id', 'nickname', 'avatar_url')
      .first();
    const playerRows = await db('character_scene_states as css')
      .join('character_sheets as cs', 'cs.id', 'css.character_id')
      .join('users as u', 'u.id', 'cs.user_id')
      .where('css.campaign_id', req.params.id)
      .whereNot('cs.user_id', campaign.gm_user_id)
      .select('u.id as user_id', 'u.nickname', 'u.avatar_url', 'cs.id as character_id', 'cs.name as character_name');
    res.json([
      {
        user_id: campaign.gm_user_id,
        nickname: gmUser?.nickname ?? '',
        avatar_url: gmUser?.avatar_url ?? null,
        character_id: null,
        character_name: null,
        role: 'gm',
      },
      ...playerRows.map((r: Record<string, unknown>) => ({
        user_id: r['user_id'],
        nickname: r['nickname'],
        avatar_url: r['avatar_url'] ?? null,
        character_id: r['character_id'],
        character_name: r['character_name'],
        role: 'player',
      })),
    ]);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/characters
campaignReadRouter.get('/:id/characters', async (req, res) => {
  try {
    const { RedisKeys, redis } = await import('../db/redis.js');
    const onlineSet = await redis.smembers(RedisKeys.campaignOnline(req.params.id));
    const onlineUserIds = new Set<string>(onlineSet);
    const rows = await db('character_scene_states as css')
      .join('character_sheets as cs', 'cs.id', 'css.character_id')
      .where('css.campaign_id', req.params.id)
      .select(
        'cs.id',
        'cs.user_id',
        'cs.name',
        'cs.avatar_url',
        'cs.ruleset_id',
        'css.current_spatial_scene_id as scene_id',
        'css.personal_story_time',
      );
    res.json(
      rows.map((row: Record<string, unknown>) => ({
        id: row['id'],
        user_id: row['user_id'],
        name: row['name'],
        avatar_url: row['avatar_url'] || '',
        ruleset_id: row['ruleset_id'],
        scene_id: row['scene_id'] || null,
        personal_story_time: safeJsonParse(row['personal_story_time'], null),
        online: onlineUserIds.has(String(row['user_id'])),
      })),
    );
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/characters/:charId
campaignReadRouter.get('/:id/characters/:charId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    const state = await db('character_scene_states')
      .where({ character_id: req.params.charId, campaign_id: req.params.id })
      .first();
    if (!state) { res.status(404).json({ error: 'Character not in campaign' }); return; }
    const sheet = await db('character_sheets').where({ id: req.params.charId }).first();
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== req.user!.id && campaign.gm_user_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    res.json({
      id: sheet.id,
      name: sheet.name,
      ruleset_id: sheet.ruleset_id,
      occupation_id: sheet.occupation_id,
      avatar_url: sheet.avatar_url || '',
      attributes: safeJsonParse(sheet.attributes, null) ?? {},
      skills: safeJsonParse(sheet.skills, null) ?? {},
      background: sheet.background || '',
    });
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/scheduled-moves
campaignReadRouter.get('/:id/scheduled-moves', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const status = req.query['status'];
    const moves = await scheduledMoveService.listByCampaign({
      campaign_id: req.params.id,
      status: typeof status === 'string' ? (status as 'pending' | 'approved' | 'cancelled') : undefined,
    });
    res.json(moves);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/moves
campaignReadRouter.get('/:id/moves', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { listMoves } = await import('../services/movement.js');
    res.json(await listMoves(req.params.id, req.query.status as string | undefined));
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/moves/pending
campaignReadRouter.get('/:id/moves/pending', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { listMoves } = await import('../services/movement.js');
    res.json(await listMoves(req.params.id, 'pending'));
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/moves/upcoming
campaignReadRouter.get('/:id/moves/upcoming', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { listMoves } = await import('../services/movement.js');
    res.json(await listMoves(req.params.id, 'approved'));
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/clues
campaignReadRouter.get('/:id/clues', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id === req.user!.id) {
      res.json(await clueService.listByCampaign(req.params.id));
    } else {
      const charRows = await db('character_sheets as cs')
        .join('character_scene_states as css', 'css.character_id', 'cs.id')
        .where('css.campaign_id', req.params.id)
        .where('cs.user_id', req.user!.id)
        .select('cs.id');
      const charIds = (charRows as Array<{ id: string }>).map((row) => row.id);
      res.json(await clueService.listVisibleToCharacters(req.params.id, charIds));
    }
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// GET /api/campaigns/:id/clues/:clueId
campaignReadRouter.get('/:id/clues/:clueId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    const clue = await clueService.getById(req.params.clueId);
    if (!clue || clue.campaign_id !== req.params.id) {
      res.status(404).json({ error: 'Clue not found' }); return;
    }
    if (campaign.gm_user_id !== req.user!.id) {
      const charRows = await db('character_sheets as cs')
        .join('character_scene_states as css', 'css.character_id', 'cs.id')
        .where('css.campaign_id', req.params.id)
        .where('cs.user_id', req.user!.id)
        .select('cs.id');
      const charIds = (charRows as Array<{ id: string }>).map((row) => row.id);
      const canView = clue.revealed_to == null || clue.revealed_to.some((id) => charIds.includes(id));
      if (!canView) { res.status(403).json({ error: 'Forbidden' }); return; }
    }
    res.json(clue);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});
