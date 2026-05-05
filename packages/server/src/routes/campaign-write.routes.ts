/**
 * campaign-write.routes.ts �?战役写入端点
 *
 * 职责：创建、更新、删除战�?场景/NPC/线索、角色加�?离场、移动管理�?
 * 禁止：直接查询只读数据做展示、OB 权限推送（�?campaign-realtime.routes.ts 负责）�?
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { safeErrorMessage } from '../utils/error-response';
import type { GridToken } from '@trpg/shared';
import { campaignService } from '../services/campaign-service';
import { clueService } from '../services/clue-service';
import { characterInstanceService } from '../services/character-sheet-service';
import { recruitmentService } from '../services/recruitment-service';
import { db } from '../db';
import { redis, RedisKeys } from '../db/redis';
import { generateId, snowflake } from '@trpg/shared';
import { io } from '../app';
import {
  serverErr,
  ensureCampaignGm,
  createCampaignSchema,
  quickCreateSchema,
  createSceneSchema,
  createNpcSchema,
  updateNpcSchema,
} from './campaign-utils';
import { getAuthedUser } from '../middleware/auth-typed';
import { logError } from '../utils/structured-logger';

export const campaignWriteRouter = Router();

// 速率限制：防止房间码遍历，每 IP 每分钟最�?20 �?
const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});

// ─── 战役 CRUD ─────────────────────────────────────────────────────────────

// POST /api/campaigns
campaignWriteRouter.post('/', async (req, res) => {
  const parsed = createCampaignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await campaignService.create({
      name: parsed.data.name,
      ruleset_id: parsed.data.ruleset_id,
      module_id: parsed.data.module_id ?? undefined,
      gm_user_id: getAuthedUser(req).id,
      is_listed_publicly: parsed.data.is_listed_publicly,
      allow_ob: parsed.data.allow_ob,
    });
    res.status(201).json(campaign);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/quick-create
campaignWriteRouter.post('/quick-create', async (req, res) => {
  const parsed = quickCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { name, ruleset_id, module_id, allow_ob, is_listed_publicly, recruit, recruitment } = parsed.data;
  const gmUserId = getAuthedUser(req).id;

  try {
    const campaign = await campaignService.create({
      name,
      ruleset_id,
      module_id: module_id ?? null,
      gm_user_id: gmUserId,
      is_listed_publicly: is_listed_publicly ?? false,
      allow_ob: allow_ob ?? false,
    });

    let recruitmentPost = null;
    if (is_listed_publicly && recruit) {
      const postTitle = recruitment?.title ?? name;
      const created = await recruitmentService.create({
        poster_id: gmUserId,
        type: 'gm_recruit',
        title: postTitle,
        ruleset_id,
        player_count_max: recruitment?.player_count_max ?? 4,
        schedule_text: recruitment?.schedule_text ?? null,
        schedule_weekday: recruitment?.schedule_weekday ?? null,
        schedule_time_slot: recruitment?.schedule_time_slot ?? null,
        description: recruitment?.description ?? null,
        tags: recruitment?.tags ?? [],
        metadata: {},
      });
      try {
        recruitmentPost = await recruitmentService.publish(created.id, gmUserId);
      } catch {
        recruitmentPost = created;
      }
    }

    res.status(201).json({ campaign, recruitment_post: recruitmentPost });
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/join（必须在 /:id 之前注册�?
campaignWriteRouter.post('/join', joinLimiter, async (req, res) => {
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: 'room code is required' }); return; }
  const campaign = await campaignService.findByRoomCode(code);
  if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
  res.json(campaign);
});

// PUT /api/campaigns/:id
campaignWriteRouter.put('/:id', async (req, res) => {
  try {
    const campaign = await campaignService.findById(req.params.id);
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM can update campaign' }); return; }
    const allowed = ['name', 'description', 'status', 'global_story_time', 'ruleset_id'];
    const safeBody: Record<string, unknown> = {};
    for (const key of allowed) {
      if ((req.body as Record<string, unknown>)[key] !== undefined)
        safeBody[key] = (req.body as Record<string, unknown>)[key];
    }
    const updated = await campaignService.update(req.params.id, safeBody);
    res.json(updated);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// ─── 场景 CRUD ─────────────────────────────────────────────────────────────

// POST /api/campaigns/:id/scenes
campaignWriteRouter.post('/:id/scenes', async (req, res) => {
  const parsed = createSceneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM can create scenes' }); return; }
    const id = generateId();
    await db('scenes').insert({
      id,
      campaign_id: req.params.id,
      name: parsed.data.name,
      type: parsed.data.type ?? 'room',
      description: parsed.data.description ?? '',
      atmosphere_keywords: JSON.stringify(parsed.data.atmosphere_keywords ?? []),
      created_by: getAuthedUser(req).id,
    });
    const scene = await db('scenes').where({ id }).first();
    res.status(201).json({ ...scene, atmosphere_keywords: parsed.data.atmosphere_keywords ?? [] });
  } catch {
    res.status(500).json({ error: 'Create failed' });
  }
});

// PUT /api/campaigns/:id/scenes/:sceneId
campaignWriteRouter.put('/:id/scenes/:sceneId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM' }); return; }
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.history_visibility !== undefined) updates.history_visibility = req.body.history_visibility;
    if (req.body.visible_history_count !== undefined) updates.visible_history_count = Number(req.body.visible_history_count);
    if (req.body.atmosphere_keywords !== undefined) {
      const kws = Array.isArray(req.body.atmosphere_keywords) ? req.body.atmosphere_keywords : [];
      updates.atmosphere_keywords = JSON.stringify(kws.slice(0, 5));
    }
    await db('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).update(updates);
    const scene = await db('scenes').where({ id: req.params.sceneId }).first();
    const keywords = (() => {
      try { return JSON.parse(scene.atmosphere_keywords ?? '[]'); } catch { return []; }
    })();
    res.json({ ...scene, atmosphere_keywords: keywords });
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// DELETE /api/campaigns/:id/scenes/:sceneId
campaignWriteRouter.delete('/:id/scenes/:sceneId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM' }); return; }
    await db.transaction(async (trx) => {
      const occupants = await trx('character_scene_states')
        .where({ current_spatial_scene_id: req.params.sceneId })
        .count('id as cnt')
        .first();
      if (Number(occupants?.cnt ?? 0) > 0) {
        throw Object.assign(new Error('场景中仍有角色，无法删除'), { status: 409 });
      }
      await trx('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).delete();
    });
    res.status(204).end();
  } catch (err: unknown) {
    const status =
      typeof (err as Record<string, unknown>)?.status === 'number'
        ? ((err as Record<string, unknown>).status as number)
        : 500;
    logError('CAMPAIGNS_DELETE_SCENE_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    res.status(status).json({ error: safeErrorMessage(err, '删除失败') });
  }
});

// PUT /api/campaigns/:id/scenes/:sceneId/grid-map
campaignWriteRouter.put('/:id/scenes/:sceneId/grid-map', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Only GM can update grid map' }); return;
    }
    const body = req.body as {
      cols?: number; rows?: number; cell_size?: number;
      background_image_url?: string | null;
      tokens?: GridToken[];
      allow_player_token_drag?: boolean;
    };
    const map = await campaignService.updateGridMap(req.params.id, req.params.sceneId, body);
    res.json(map);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// ─── 角色加入/离场 ─────────────────────────────────────────────────────────

// POST /api/campaigns/:id/characters/:characterId/join
campaignWriteRouter.post('/:id/characters/:characterId/join', async (req, res) => {
  try {
    const { id: campaignId, characterId } = req.params;
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const character = await db('character_sheets').where({ id: characterId }).select('user_id').first();
    if (!campaign || !character) { res.status(404).json({ error: 'Not found' }); return; }
    if (character.user_id !== getAuthedUser(req).id && campaign.gm_user_id !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const instance = await characterInstanceService.getOrCreate({
      character_id: characterId,
      campaign_id: campaignId,
      user_id: character.user_id as string,
    });
    res.status(201).json(instance);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/:id/scenes/:sceneId/join
campaignWriteRouter.post('/:id/scenes/:sceneId/join', async (req, res) => {
  try {
    const { id: campaignId, sceneId } = req.params;
    const { character_id } = req.body;
    if (!character_id) { res.status(400).json({ error: 'character_id required' }); return; }
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const character = await db('character_sheets').where({ id: character_id }).select('user_id').first();
    if (!campaign || !character) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id && character.user_id !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const { joinScene } = await import('../services/scene-participation.js');
    await joinScene(character_id, campaignId, sceneId);
    res.json({ ok: true });
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/:id/scenes/:sceneId/leave
campaignWriteRouter.post('/:id/scenes/:sceneId/leave', async (req, res) => {
  try {
    const { id: campaignId, sceneId } = req.params;
    const { character_id } = req.body;
    if (!character_id) { res.status(400).json({ error: 'character_id required' }); return; }
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const character = await db('character_sheets').where({ id: character_id }).select('user_id').first();
    if (!campaign || !character) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id && character.user_id !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const { leaveScene } = await import('../services/scene-participation.js');
    await leaveScene(character_id, campaignId, sceneId);
    res.json({ ok: true });
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// ─── 场景连接 CRUD ─────────────────────────────────────────────────────────

async function upsertSceneConnection(
  campaignId: string,
  userId: string,
  body: Record<string, unknown>,
  connId?: string,
): Promise<{ status: number; body: unknown }> {
  const auth = await ensureCampaignGm(campaignId, userId);
  if (!auth.ok) return { status: auth.status, body: { error: auth.error } };

  const fromSceneId = body['from_scene_id'];
  const toSceneId = body['to_scene_id'];
  if (!fromSceneId || !toSceneId) {
    return { status: 400, body: { error: 'from_scene_id and to_scene_id are required' } };
  }
  const walkDuration = Number(body['walk_duration']);
  if (!Number.isFinite(walkDuration) || walkDuration <= 0) {
    return { status: 400, body: { error: 'walk_duration must be a positive number' } };
  }
  const payload = {
    from_scene_id: fromSceneId,
    to_scene_id: toSceneId,
    walk_duration: walkDuration,
    bike_duration: body['bike_duration'] == null ? null : Number(body['bike_duration']),
    drive_duration: body['drive_duration'] == null ? null : Number(body['drive_duration']),
    is_bidirectional: body['is_bidirectional'] ?? true,
  };

  if (!connId) {
    const id = generateId();
    await db('scene_connections').insert({ id, campaign_id: campaignId, created_by: userId, ...payload });
    const conn = await db('scene_connections').where({ id }).first();
    return { status: 201, body: conn };
  }

  const updated = await db('scene_connections')
    .where({ id: connId, campaign_id: campaignId })
    .update(payload);
  if (!updated) return { status: 404, body: { error: 'Connection not found' } };
  const conn = await db('scene_connections').where({ id: connId }).first();
  return { status: 200, body: conn };
}

// POST /api/campaigns/:id/connections
campaignWriteRouter.post('/:id/connections', async (req, res) => {
  try {
    const result = await upsertSceneConnection(req.params.id, getAuthedUser(req).id, req.body);
    res.status(result.status).json(result.body);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// PUT /api/campaigns/:id/connections/:connId
campaignWriteRouter.put('/:id/connections/:connId', async (req, res) => {
  try {
    const result = await upsertSceneConnection(req.params.id, getAuthedUser(req).id, req.body, req.params.connId);
    res.status(result.status).json(result.body);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// DELETE /api/campaigns/:id/connections/:connId
campaignWriteRouter.delete('/:id/connections/:connId', async (req, res) => {
  try {
    const auth = await ensureCampaignGm(req.params.id, getAuthedUser(req).id);
    if (!auth.ok) { res.status(auth.status).json({ error: auth.error }); return; }
    const deleted = await db('scene_connections')
      .where({ id: req.params.connId, campaign_id: req.params.id })
      .delete();
    if (!deleted) { res.status(404).json({ error: 'Connection not found' }); return; }
    res.status(204).end();
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// 兼容旧路�?POST /:id/scenes/connections
campaignWriteRouter.post('/:id/scenes/connections', async (req, res) => {
  try {
    const result = await upsertSceneConnection(req.params.id, getAuthedUser(req).id, req.body);
    res.status(result.status).json(result.body);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// ─── NPC CRUD ──────────────────────────────────────────────────────────────

// POST /api/campaigns/:id/npcs
campaignWriteRouter.post('/:id/npcs', async (req, res) => {
  const parsed = createNpcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM can create NPCs' }); return; }
    const id = generateId();
    await db('campaign_npcs').insert({
      id,
      campaign_id: req.params.id,
      created_by: getAuthedUser(req).id,
      name: parsed.data.name,
      display_name: parsed.data.display_name ?? parsed.data.name,
      description: parsed.data.description,
      avatar_url: parsed.data.avatar_url ?? '',
      voice_tips: parsed.data.voice_tips,
      attributes: parsed.data.attributes,
      skills: parsed.data.skills,
      resources: parsed.data.resources,
      is_temporary: parsed.data.is_temporary ?? false,
      is_playable: parsed.data.is_playable ?? true,
      is_active: parsed.data.is_active ?? true,
      source_module_npc_id: parsed.data.source_module_npc_id,
    });
    const npc = await db('campaign_npcs').where({ id }).first();
    res.status(201).json(npc);
  } catch {
    res.status(500).json({ error: 'Create failed' });
  }
});

// PUT /api/campaigns/:id/npcs/:npcId
campaignWriteRouter.put('/:id/npcs/:npcId', async (req, res) => {
  const parsed = updateNpcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM can update NPCs' }); return; }
    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(parsed.data)) {
      if (val !== undefined) updates[key] = val;
    }
    await db('campaign_npcs').where({ id: req.params.npcId, campaign_id: req.params.id }).update(updates);
    const npc = await db('campaign_npcs').where({ id: req.params.npcId }).first();
    res.json(npc ?? { error: 'Not found' });
  } catch {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ─── 移动管理 ──────────────────────────────────────────────────────────────

// POST /api/campaigns/:id/force-move（旧路径兼容�?
campaignWriteRouter.post('/:id/force-move', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Only GM can force move characters' }); return;
    }
    const { character_id, to_scene_id } = req.body;
    if (!character_id || !to_scene_id) {
      res.status(400).json({ error: 'character_id and to_scene_id are required' }); return;
    }
    const { forceMove } = await import('../services/movement.js');
    const result = await forceMove(character_id, to_scene_id, req.params.id, getAuthedUser(req).id);
    res.json({ character_id, ...result });
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/:id/time/announce
campaignWriteRouter.post('/:id/time/announce', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { announceTime } = await import('../services/time.js');
    const result = await announceTime(
      req.params.id,
      String(req.body.scene_id ?? ''),
      String(req.body.time_label ?? ''),
      getAuthedUser(req).id,
    );
    res.json(result);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/:id/moves/request
campaignWriteRouter.post('/:id/moves/request', async (req, res) => {
  try {
    const { character_id, to_scene_id } = req.body;
    const transportMode = (req.body.transport_mode ?? 'walk') as 'walk' | 'bike' | 'drive';
    if (!character_id || !to_scene_id) {
      res.status(400).json({ error: 'character_id and to_scene_id are required' }); return;
    }
    const character = await db('character_sheets').where({ id: character_id }).select('user_id').first();
    const campaign = await db('campaigns')
      .where({ id: req.params.id })
      .select('gm_user_id', 'global_story_time')
      .first();
    if (!character || !campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (character.user_id !== getAuthedUser(req).id && campaign.gm_user_id !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const sceneState = await db('character_scene_states')
      .where({ character_id, campaign_id: req.params.id })
      .select('current_spatial_scene_id', 'personal_story_time')
      .first();
    if (!sceneState) { res.status(404).json({ error: 'Character not in campaign' }); return; }
    const fromSceneId = sceneState.current_spatial_scene_id as string | null;
    if (!fromSceneId) { res.status(400).json({ error: 'Character has no current scene' }); return; }

    let travelDuration = 0;
    if (fromSceneId !== to_scene_id) {
      const direct = await db('scene_connections')
        .where({ campaign_id: req.params.id, from_scene_id: fromSceneId, to_scene_id })
        .first();
      const reverse = await db('scene_connections')
        .where({
          campaign_id: req.params.id,
          from_scene_id: to_scene_id,
          to_scene_id: fromSceneId,
          is_bidirectional: true,
        })
        .first();
      const conn = direct ?? reverse;
      if (!conn) { res.status(400).json({ error: '没有到达该场景的已知路线' }); return; }
      if (transportMode === 'bike' && conn.bike_duration != null) travelDuration = Number(conn.bike_duration);
      else if (transportMode === 'drive' && conn.drive_duration != null) travelDuration = Number(conn.drive_duration);
      else travelDuration = Number(conn.walk_duration ?? 0);
    }

    const { requestMove } = await import('../services/movement.js');
    try {
      const result = await requestMove(character_id, req.params.id, to_scene_id);
      res.status(201).json({
        ...result.record,
        from_scene_id: fromSceneId,
        transport_mode: transportMode,
        travel_duration: travelDuration,
        execute_at_story: null,
      });
    } catch (moveErr: unknown) {
      logError('CAMPAIGNS_REQUEST_MOVE_FAILED', 'medium', moveErr instanceof Error ? moveErr.message : String(moveErr));
      res.status(400).json({ error: safeErrorMessage(moveErr, '移动申请失败') });
    }
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/:id/moves/:moveId/approve
campaignWriteRouter.post('/:id/moves/:moveId/approve', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { approveMove } = await import('../services/movement.js');
    const result = await approveMove(req.params.moveId!, getAuthedUser(req).id, req.body.story_arrival_time ?? null);
    if (!result.record) { res.status(404).json({ error: 'Move not found' }); return; }
    res.json(result);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/:id/moves/:moveId/reject
campaignWriteRouter.post('/:id/moves/:moveId/reject', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { rejectMove } = await import('../services/movement.js');
    const move = await rejectMove(req.params.moveId!, getAuthedUser(req).id);
    if (!move) { res.status(404).json({ error: 'Move not found' }); return; }
    res.json(move);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// POST /api/campaigns/:id/moves/force
campaignWriteRouter.post('/:id/moves/force', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { character_id, to_scene_id } = req.body;
    if (!character_id || !to_scene_id) { res.status(400).json({ error: 'Missing fields' }); return; }
    const { forceMove } = await import('../services/movement.js');
    const result = await forceMove(character_id, to_scene_id, req.params.id, getAuthedUser(req).id);

    // 插入系统过渡消息到聊天流
    const [toScene, charSheet] = await Promise.all([
      db('scenes').where({ id: to_scene_id }).select('name').first().catch(() => null),
      db('character_sheets').where({ id: character_id }).select('name').first().catch(() => null),
    ]);
    const fromScene = result.from_scene_id
      ? await db('scenes').where({ id: result.from_scene_id }).select('name').first().catch(() => null)
      : null;
    const transitionContent = fromScene
      ? `${charSheet?.name ?? '角色'} 离开 ${fromScene.name}，前往 ${toScene?.name ?? '目标场景'}`
      : `${charSheet?.name ?? '角色'} 前往 ${toScene?.name ?? '目标场景'}`;
    const sysMsg = {
      id: String(snowflake.nextId()),
      scene_id: to_scene_id,
      campaign_id: req.params.id,
      sender_user_id: getAuthedUser(req).id,
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
    await redis.lpush(RedisKeys.messageBuffer(req.params.id), JSON.stringify(sysMsg));
    await redis.ltrim(RedisKeys.messageBuffer(req.params.id), 0, 199);
    const roomNsp = io.of('/room');
    (roomNsp.to(`campaign:${req.params.id}`) as ReturnType<typeof roomNsp.to>).emit('new_message', sysMsg);
    (roomNsp.to(`campaign:${req.params.id}`) as ReturnType<typeof roomNsp.to>).emit('position_changed', {
      character_id,
      from_scene_id: result.from_scene_id ?? '',
      to_scene_id: result.to_scene_id,
      move_type: 'force_move',
    });

    res.json(result);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// ─── 线索 CRUD ─────────────────────────────────────────────────────────────

// POST /api/campaigns/:id/clues
campaignWriteRouter.post('/:id/clues', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM can create clues' }); return; }
    const { title, content, theme, is_revealed, revealed_to } = req.body as {
      title?: string;
      content?: string;
      theme?: 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';
      is_revealed?: boolean;
      revealed_to?: string[] | null;
    };
    if (!title || !content || !theme) {
      res.status(400).json({ error: 'title, content and theme are required' }); return;
    }
    const clue = await clueService.create({ campaign_id: req.params.id, title, content, theme, is_revealed, revealed_to });
    res.status(201).json(clue);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});

// PUT /api/campaigns/:id/clues/:clueId
campaignWriteRouter.put('/:id/clues/:clueId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Only GM can update clues' }); return; }
    const clue = await clueService.update(req.params.clueId, req.body ?? {});
    if (!clue) { res.status(404).json({ error: 'Clue not found' }); return; }
    res.json(clue);
  } catch (err: unknown) {
    serverErr(res, err);
  }
});
