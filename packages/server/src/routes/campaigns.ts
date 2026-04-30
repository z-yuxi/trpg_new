import { Router, type IRouter } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import type { GridToken, StoryTime } from '@trpg/shared';
import { authMiddleware } from '../middleware/auth';
import { campaignService, scheduledMoveService } from '../services/campaign-service';
import { clueService } from '../services/clue-service';
import { characterInstanceService } from '../services/character-sheet-service';
import {
  grantObPermission,
  revokeObPermission,
  canManageSceneObPermission,
  listSceneActiveObPermissions,
  getSceneActiveObPermissionMap,
} from '../services/scene-ob-permission-service';
import { recruitmentService } from '../services/recruitment-service';
import { db } from '../db';
import { redis, RedisKeys } from '../db/redis';
import { generateId, snowflake } from '@trpg/shared';
import { io } from '../app';
import { safeJsonParse } from '../utils/safe-json';

const router: IRouter = Router();

// 速率限制：防止房间码遍历攻击，每 IP 每分钟最多 20 次
const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});

// 所有战役路由都需要认证
router.use(authMiddleware);

/**
 * 检查用户是否为战役成员（GM 或有角色的团员）。
 * 可复用于步骤七（读取授权）和步骤八（写入安全）。
 */
async function ensureCampaignMember(
  campaignId: string,
  userId: string,
): Promise<{ ok: boolean; isGm: boolean; campaign?: Record<string, unknown> }> {
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  if (!campaign) return { ok: false, isGm: false };
  if ((campaign as Record<string, unknown>)['gm_user_id'] === userId) {
    return { ok: true, isGm: true, campaign: campaign as Record<string, unknown> };
  }
  // 检查用户是否有角色在该战役中
  const member = await db('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .where('css.campaign_id', campaignId)
    .where('cs.user_id', userId)
    .first();
  if (member) return { ok: true, isGm: false, campaign: campaign as Record<string, unknown> };
  return { ok: false, isGm: false };
}

const createSchema = z.object({
  name: z.string().min(1).max(128),
  ruleset_id: z.string().min(1),
  /** 来自模组资产入口时传入；规则包入口时留空（固定 null） */
  module_id: z.string().optional().nullable(),
  /** 是否公开招募，默认 false（私密团） */
  is_listed_publicly: z.boolean().optional(),
  /** 是否允许观战，默认 false */
  allow_ob: z.boolean().optional(),
});

const sceneObPermissionSchema = z.object({
  user_id: z.string().min(1),
});

const createSceneSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['lobby', 'room', 'outdoor', 'dungeon', 'special']).optional(),
  description: z.string().max(2000).optional(),
});

const createNpcSchema = z.object({
  name: z.string().min(1).max(100),
  display_name: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  avatar_url: z.string().max(500).optional(),
  voice_tips: z.string().max(500).optional(),
  attributes: z.unknown().optional(),
  skills: z.unknown().optional(),
  resources: z.unknown().optional(),
  is_temporary: z.boolean().optional(),
  is_playable: z.boolean().optional(),
  is_active: z.boolean().optional(),
  source_module_npc_id: z.string().optional(),
});

const updateNpcSchema = createNpcSchema.partial().omit({ source_module_npc_id: true });

function parseStoryTime(value: unknown): StoryTime | null {
  try {
    if (!value) return null;
    if (typeof value === 'string') return JSON.parse(value) as StoryTime;
    if (typeof value === 'object') return value as StoryTime;
    return null;
  } catch {
    return null;
  }
}

function toStoryMinutes(time: StoryTime): number {
  return (time.day - 1) * 24 * 60 + time.hour * 60 + time.minute;
}

function addStoryMinutes(base: StoryTime, deltaMinutes: number): StoryTime {
  let total = toStoryMinutes(base) + deltaMinutes;
  if (total < 0) total = 0;
  const day = Math.floor(total / (24 * 60)) + 1;
  const hour = Math.floor((total % (24 * 60)) / 60);
  const minute = total % 60;
  return { day, hour, minute };
}

// POST /api/campaigns
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await campaignService.create({
      name: parsed.data.name,
      ruleset_id: parsed.data.ruleset_id,
      module_id: parsed.data.module_id ?? undefined,
      gm_user_id: req.user!.id,
      is_listed_publicly: parsed.data.is_listed_publicly,
      allow_ob: parsed.data.allow_ob,
    });
    res.status(201).json(campaign);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// GET /api/campaigns
router.get('/', async (req, res) => {
  try {
    const campaigns = await campaignService.findByUserId(req.user!.id);
    res.json(campaigns);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

/**
 * POST /api/campaigns/quick-create
 *
 * 原子化"一键创建房间"接口：
 *   1. 创建战役（is_listed_publicly / allow_ob 由请求决定）
 *   2. 若 recruit=true，立即创建并发布招募帖（draft → open）
 *   返回 { campaign, recruitment_post? }
 */
const quickCreateSchema = z.object({
  name: z.string().min(1).max(128),
  ruleset_id: z.string().min(1),
  module_id: z.string().optional().nullable(),
  allow_ob: z.boolean().optional(),
  /** true = 公开房间，自动关联招募帖；false = 私密房间（默认） */
  is_listed_publicly: z.boolean().optional(),
  /** 是否同时创建并发布招募帖（仅 is_listed_publicly=true 时生效） */
  recruit: z.boolean().optional(),
  /** 招募帖附加字段（简化版，标题/描述/人数上限/标签/时间） */
  recruitment: z
    .object({
      title: z.string().min(1).max(50).optional(),
      description: z.string().max(2000).optional(),
      player_count_max: z.number().int().min(1).max(20).optional(),
      schedule_text: z.string().max(255).optional(),
      schedule_weekday: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).max(7).optional().nullable(),
      schedule_time_slot: z.enum(['morning', 'afternoon', 'evening', 'night']).optional().nullable(),
      tags: z.array(z.string()).max(10).optional(),
    })
    .optional(),
});

router.post('/quick-create', async (req, res) => {
  const parsed = quickCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { name, ruleset_id, module_id, allow_ob, is_listed_publicly, recruit, recruitment } = parsed.data;
  const gmUserId = req.user!.id;

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
      // 创建招募帖
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
      // 立即发布（draft → open）
      try {
        recruitmentPost = await recruitmentService.publish(created.id, gmUserId);
      } catch {
        recruitmentPost = created; // 发布失败仍返回草稿
      }
    }

    res.status(201).json({ campaign, recruitment_post: recruitmentPost });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Quick create failed' });
  }
});

// POST /api/campaigns/join（必须在 /:id 之前注册）
router.post('/join', joinLimiter, async (req, res) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: 'room code is required' });
    return;
  }
  const campaign = await campaignService.findByRoomCode(code);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  res.json(campaign);
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  const campaign = await campaignService.findById(req.params.id);
  if (!campaign) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(campaign);
});

// PUT /api/campaigns/:id
router.put('/:id', async (req, res) => {
  try {
    const campaign = await campaignService.findById(req.params.id);
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can update campaign' }); return; }
    const allowed = ['name', 'description', 'status', 'global_story_time', 'ruleset_id'];
    const safeBody: Record<string, unknown> = {};
    for (const key of allowed) {
      if ((req.body as Record<string, unknown>)[key] !== undefined) safeBody[key] = (req.body as Record<string, unknown>)[key];
    }
    const updated = await campaignService.update(req.params.id, safeBody);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// GET /api/campaigns/:id/scenes
router.get('/:id/scenes', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const scenes = await campaignService.listScenes(req.params.id);
    res.json(scenes);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/scenes/:sceneId/grid-map
router.get('/:id/scenes/:sceneId/grid-map', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const map = await campaignService.getGridMap(req.params.id, req.params.sceneId);
    res.json(map);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// PUT /api/campaigns/:id/scenes/:sceneId/grid-map
router.put('/:id/scenes/:sceneId/grid-map', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can update grid map' }); return; }

    const body = req.body as {
      cols?: number;
      rows?: number;
      cell_size?: number;
      background_image_url?: string | null;
      tokens?: GridToken[];
      allow_player_token_drag?: boolean;
    };

    const map = await campaignService.updateGridMap(req.params.id, req.params.sceneId, body);
    res.json(map);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// POST /api/campaigns/:id/scenes
router.post('/:id/scenes', async (req, res) => {
  const parsed = createSceneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can create scenes' }); return; }
    const id = generateId();
    await db('scenes').insert({
      id,
      campaign_id: req.params.id,
      name: parsed.data.name,
      type: parsed.data.type ?? 'room',
      description: parsed.data.description ?? '',
      created_by: req.user!.id,
    });
    const scene = await db('scenes').where({ id }).first();
    res.status(201).json(scene);
  } catch (err: any) {
    res.status(500).json({ error: 'Create failed' });
  }
});

// PUT /api/campaigns/:id/scenes/:sceneId — 编辑场景
router.put('/:id/scenes/:sceneId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const updates: Record<string, unknown> = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.history_visibility !== undefined) updates.history_visibility = req.body.history_visibility;
    if (req.body.visible_history_count !== undefined) updates.visible_history_count = Number(req.body.visible_history_count);
    await db('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).update(updates);
    const scene = await db('scenes').where({ id: req.params.sceneId }).first();
    res.json(scene);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// DELETE /api/campaigns/:id/scenes/:sceneId — 删除场景（无角色在场才可删）
router.delete('/:id/scenes/:sceneId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    // 检查和删除放入事务，防止检查后有角色进入
    await db.transaction(async (trx) => {
      const occupants = await trx('character_scene_states')
        .where({ current_spatial_scene_id: req.params.sceneId }).count('id as cnt').first();
      if (Number(occupants?.cnt ?? 0) > 0) {
        throw Object.assign(new Error('场景中仍有角色，无法删除'), { status: 409 });
      }
      await trx('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).delete();
    });
    res.status(204).end();
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ error: err?.message ?? 'Delete failed' });
  }
});

// POST /api/campaigns/:id/characters/:characterId/join — 角色加入战团（实例化）
router.post('/:id/characters/:characterId/join', async (req, res) => {
  try {
    const { id: campaignId, characterId } = req.params;
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const character = await db('character_sheets').where({ id: characterId }).select('user_id').first();
    if (!campaign || !character) { res.status(404).json({ error: 'Not found' }); return; }
    // 允许：本人 或 GM
    if (character['user_id'] !== req.user!.id && campaign['gm_user_id'] !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const instance = await characterInstanceService.getOrCreate({
      character_id: characterId,
      campaign_id: campaignId,
      user_id: character['user_id'] as string,
    });
    res.status(201).json(instance);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Join campaign failed' });
  }
});

// POST /api/campaigns/:id/scenes/:sceneId/join — 角色进入场景
router.post('/:id/scenes/:sceneId/join', async (req, res) => {
  try {
    const { id: campaignId, sceneId } = req.params;
    const { character_id } = req.body;
    if (!character_id) { res.status(400).json({ error: 'character_id required' }); return; }
    // 鉴权：GM 或角色所有者
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const character = await db('character_sheets').where({ id: character_id }).select('user_id').first();
    if (!campaign || !character) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id && character.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const { joinScene } = await import('../services/scene-participation.js');
    await joinScene(character_id, campaignId, sceneId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Join scene failed' });
  }
});

// POST /api/campaigns/:id/scenes/:sceneId/leave — 角色离开场景
router.post('/:id/scenes/:sceneId/leave', async (req, res) => {
  try {
    const { id: campaignId, sceneId } = req.params;
    const { character_id } = req.body;
    if (!character_id) { res.status(400).json({ error: 'character_id required' }); return; }
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const character = await db('character_sheets').where({ id: character_id }).select('user_id').first();
    if (!campaign || !character) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id && character.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const { leaveScene } = await import('../services/scene-participation.js');
    await leaveScene(character_id, campaignId, sceneId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Leave scene failed' });
  }
});

// GET /api/campaigns/:id/scenes/:sceneId/participants — 场景参与者列表
router.get('/:id/scenes/:sceneId/participants', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const { getParticipants } = await import('../services/scene-participation.js');
    const participants = await getParticipants(req.params.sceneId!);
    res.json(participants);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/scenes/:sceneId/ob-permissions
router.get('/:id/scenes/:sceneId/ob-permissions', async (req, res) => {
  try {
    const scene = await db('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).first();
    if (!scene) {
      res.status(404).json({ error: 'SCENE_NOT_FOUND' });
      return;
    }

    const canManage = await canManageSceneObPermission(req.params.sceneId, req.user!.id);
    if (!canManage) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }

    const permissions = await listSceneActiveObPermissions(req.params.sceneId);
    res.json(permissions);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'List failed' });
  }
});

// POST /api/campaigns/:id/scenes/:sceneId/ob-permissions/grant
router.post('/:id/scenes/:sceneId/ob-permissions/grant', async (req, res) => {
  const parsed = sceneObPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const scene = await db('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).first();
    if (!scene) {
      res.status(404).json({ error: 'SCENE_NOT_FOUND' });
      return;
    }

    const result = await grantObPermission(req.params.sceneId, parsed.data.user_id, req.user!.id);

    // 推送到被授权用户的个人频道
    const socketId = await redis.get(RedisKeys.userSocket(parsed.data.user_id));
    if (socketId) {
      (io.to(socketId) as any).emit('ob_permission_granted', {
        campaign_id: result.campaignId,
        scene_id: req.params.sceneId,
        user_id: parsed.data.user_id,
        granted_at: result.permission.granted_at,
      });
    }

    res.status(result.alreadyGranted ? 200 : 201).json(result.permission);
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({ error: err?.message ?? 'Grant failed' });
  }
});

// POST /api/campaigns/:id/scenes/:sceneId/ob-permissions/revoke
router.post('/:id/scenes/:sceneId/ob-permissions/revoke', async (req, res) => {
  const parsed = sceneObPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const scene = await db('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).first();
    if (!scene) {
      res.status(404).json({ error: 'SCENE_NOT_FOUND' });
      return;
    }

    const result = await revokeObPermission(req.params.sceneId, parsed.data.user_id, req.user!.id);

    const socketId = await redis.get(RedisKeys.userSocket(parsed.data.user_id));
    if (socketId) {
      (io.to(socketId) as any).emit('ob_permission_revoked', {
        campaign_id: result.campaignId,
        scene_id: req.params.sceneId,
        user_id: parsed.data.user_id,
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({ error: err?.message ?? 'Revoke failed' });
  }
});

async function listSceneConnections(campaignId: string) {
  return db('scene_connections as sc')
    .leftJoin('scenes as fs', 'fs.id', 'sc.from_scene_id')
    .leftJoin('scenes as ts', 'ts.id', 'sc.to_scene_id')
    .where('sc.campaign_id', campaignId)
    .select(
      'sc.*',
      'fs.name as from_scene_name',
      'ts.name as to_scene_name',
    )
    .orderBy('sc.created_at', 'asc');
}

async function ensureCampaignGm(campaignId: string, userId: string) {
  const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
  if (!campaign) return { ok: false as const, status: 404, error: 'Campaign not found' };
  if (campaign.gm_user_id !== userId) return { ok: false as const, status: 403, error: 'Only GM can manage scene connections' };
  return { ok: true as const };
}

async function upsertSceneConnection(req: any, res: any, isCreate: boolean) {
  const auth = await ensureCampaignGm(req.params.id, req.user!.id);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const fromSceneId = req.body.from_scene_id;
  const toSceneId = req.body.to_scene_id;
  if (!fromSceneId || !toSceneId) {
    res.status(400).json({ error: 'from_scene_id and to_scene_id are required' });
    return;
  }

  const walkDuration = Number(req.body.walk_duration);
  if (!Number.isFinite(walkDuration) || walkDuration <= 0) {
    res.status(400).json({ error: 'walk_duration must be a positive number' });
    return;
  }

  const payload = {
    from_scene_id: fromSceneId,
    to_scene_id: toSceneId,
    walk_duration: walkDuration,
    bike_duration: req.body.bike_duration == null ? null : Number(req.body.bike_duration),
    drive_duration: req.body.drive_duration == null ? null : Number(req.body.drive_duration),
    is_bidirectional: req.body.is_bidirectional ?? true,
  };

  if (isCreate) {
    const id = generateId();
    await db('scene_connections').insert({
      id,
      campaign_id: req.params.id,
      created_by: req.user!.id,
      ...payload,
    });
    const conn = await db('scene_connections').where({ id }).first();
    res.status(201).json(conn);
    return;
  }

  const updated = await db('scene_connections')
    .where({ id: req.params.connId, campaign_id: req.params.id })
    .update(payload);
  if (!updated) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }
  const conn = await db('scene_connections').where({ id: req.params.connId }).first();
  res.json(conn);
}

// POST /api/campaigns/:id/connections
router.post('/:id/connections', async (req, res) => {
  try {
    await upsertSceneConnection(req, res, true);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// PUT /api/campaigns/:id/connections/:connId
router.put('/:id/connections/:connId', async (req, res) => {
  try {
    await upsertSceneConnection(req, res, false);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// DELETE /api/campaigns/:id/connections/:connId
router.delete('/:id/connections/:connId', async (req, res) => {
  try {
    const auth = await ensureCampaignGm(req.params.id, req.user!.id);
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    const deleted = await db('scene_connections')
      .where({ id: req.params.connId, campaign_id: req.params.id })
      .delete();
    if (!deleted) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Delete failed' });
  }
});

// GET /api/campaigns/:id/connections
router.get('/:id/connections', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const connections = await listSceneConnections(req.params.id);
    res.json(connections);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// 兼容旧路径
router.post('/:id/scenes/connections', async (req, res) => {
  try {
    await upsertSceneConnection(req, res, true);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

router.get('/:id/scenes/connections', async (req, res) => {
  try {
    const connections = await listSceneConnections(req.params.id);
    res.json(connections);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// POST /api/campaigns/:id/npcs
router.post('/:id/npcs', async (req, res) => {
  const parsed = createNpcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can create NPCs' }); return; }
    const id = generateId();
    await db('campaign_npcs').insert({
      id,
      campaign_id: req.params.id,
      created_by: req.user!.id,
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
  } catch (err: any) {
    res.status(500).json({ error: 'Create failed' });
  }
});

// GET /api/campaigns/:id/npcs
router.get('/:id/npcs', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const npcs = await db('campaign_npcs').where({ campaign_id: req.params.id });
    res.json(npcs);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// PUT /api/campaigns/:id/npcs/:npcId
router.put('/:id/npcs/:npcId', async (req, res) => {
  const parsed = updateNpcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can update NPCs' }); return; }
    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(parsed.data)) {
      if (val !== undefined) updates[key] = val;
    }
    await db('campaign_npcs').where({ id: req.params.npcId, campaign_id: req.params.id }).update(updates);
    const npc = await db('campaign_npcs').where({ id: req.params.npcId }).first();
    res.json(npc ?? { error: 'Not found' });
  } catch (err: any) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// GET /api/campaigns/:id/messages
router.get('/:id/messages', async (req, res) => {
  try {
    const campaignId = req.params.id!;
    const userId = req.user!.id;

    // 先验证用户是否为战役成员
    const memberAuth = await ensureCampaignMember(campaignId, userId);
    if (!memberAuth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }

    // 查询团信息（判断 GM 身份）
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    const isGm = campaign?.gm_user_id === userId;

    // 查询当前用户在本团内的角色 ID 列表
    let userCharIds: string[] = [];
    let activeVirtualSceneIds = new Set<string>();
    let activeObPermissionMap = new Map<string, Date>();
    if (!isGm) {
      const charRows = await db('character_sheets')
        .where({ user_id: userId })
        .join('character_scene_states', 'character_sheets.id', 'character_scene_states.character_id')
        .where('character_scene_states.campaign_id', campaignId)
        .select('character_sheets.id as char_id');
      userCharIds = (charRows as { char_id: string }[]).map((r) => r.char_id);

      if (userCharIds.length > 0) {
        const participationRows = await db('scene_participations as sp')
          .join('scenes as s', 's.id', 'sp.scene_id')
          .whereIn('sp.character_id', userCharIds)
          .whereNull('sp.left_at')
          .where('s.type', 'virtual')
          .where('s.campaign_id', campaignId)
          .select('sp.scene_id');
        activeVirtualSceneIds = new Set((participationRows as { scene_id: string }[]).map((row) => row.scene_id));
      }

      activeObPermissionMap = await getSceneActiveObPermissionMap(campaignId, userId);
    }

    let query = db('chat_messages as cm')
      .leftJoin('scenes as s', 's.id', 'cm.scene_id')
      .where('cm.campaign_id', campaignId)
      .select('cm.*', 's.type as scene_type')
      .orderBy('cm.id', 'asc')
      .limit(50);
    if (req.query.after_id) {
      query = (query as any).where('cm.id', '>', String(req.query.after_id));
    }
    const sceneId = req.query.scene_id as string | undefined;
    if (sceneId) {
      query = query.where('cm.scene_id', sceneId);

      // history_visibility 限制（非 GM）
      if (!isGm && sceneId) {
        const scene = await db('scenes').where({ id: sceneId }).select('history_visibility', 'visible_history_count').first().catch(() => null);
        if (scene && scene.history_visibility !== 'all') {
          if (scene.history_visibility === 'none') {
            // 按角色参与时间段过滤（任务 1.2）：EXISTS 子查询覆盖多次进出的所有区间
            // 条件：joined_at <= message.created_at AND (left_at IS NULL OR left_at >= message.created_at)
            if (userCharIds.length > 0) {
              query = query.whereExists(function (this: any) {
                this.from('scene_participations as sp2')
                  .whereIn('sp2.character_id', userCharIds)
                  .where('sp2.scene_id', sceneId)
                  .whereRaw('sp2.joined_at <= cm.created_at')
                  .andWhere(function (this: any) {
                    this.whereNull('sp2.left_at').orWhereRaw('sp2.left_at >= cm.created_at');
                  });
              });
            } else {
              // 无角色 → 无权查看历史消息
              query = query.whereRaw('1 = 0');
            }
          } else if (scene.history_visibility === 'recent') {
            const limit = scene.visible_history_count ?? 20;
            query = db('chat_messages as cm')
              .leftJoin('scenes as s', 's.id', 'cm.scene_id')
              .where('cm.campaign_id', campaignId)
              .where('cm.scene_id', sceneId)
              .select('cm.*', 's.type as scene_type')
              .orderBy('cm.id', 'desc')
              .limit(limit);
          }
        }
      }
    }

    const messages = await query;

    // 序列化并按可见性过滤
    const serialized = messages.map((m: Record<string, unknown>) => ({
      ...m,
      id: m['id']?.toString(),
      visible_to: safeJsonParse(m['visible_to'], null),
      story_time: safeJsonParse(m['story_time'], null),
      metadata: safeJsonParse(m['metadata'], null),
    }));

    // GM 可查看所有消息；普通玩家只能看 visible_to=null 或包含自己角色 ID 的消息
    const filtered = isGm
      ? serialized
      : serialized.filter((msg) => {
          const msgSceneType = String((msg as Record<string, unknown>)['scene_type'] ?? '');
          const msgSceneId = String((msg as Record<string, unknown>)['scene_id'] ?? '');
          if (msgSceneType === 'virtual') {
            if (activeVirtualSceneIds.has(msgSceneId)) {
              // 参与者正常可见
            } else {
              const grantedAt = activeObPermissionMap.get(msgSceneId);
              if (!grantedAt) return false;

              const createdAtRaw = (msg as Record<string, unknown>)['created_at'];
              const createdAt = createdAtRaw instanceof Date ? createdAtRaw : new Date(String(createdAtRaw));
              if (Number.isNaN(createdAt.getTime())) return false;
              if (createdAt < grantedAt) return false;
            }
          }
          if ((msg as Record<string, unknown>)['sender_user_id'] === userId) return true;
          const msgType = (msg as Record<string, unknown>)['message_type'] as string;
          if (msgType === 'system' || msgType === 'announcement') return true;
          if (msg['visible_to'] === null) return true;
          return (msg['visible_to'] as string[]).some((cid) => userCharIds.includes(cid) || cid === '*' || cid === userId);
        });

    // 按 id 升序排（recent 模式是 desc 查询，需要翻转）
    if (req.query.scene_id && !isGm) {
      const scene = await db('scenes').where({ id: req.query.scene_id }).select('history_visibility').first().catch(() => null);
      if (scene?.history_visibility === 'recent') filtered.reverse();
    }

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/round-state
router.get('/:id/round-state', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const state = await db('campaign_round_state').where({ campaign_id: req.params.id }).first() ?? null;
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/position-history
router.get('/:id/position-history', async (req, res) => {
  const auth = await ensureCampaignMember(req.params.id, req.user!.id);
  if (!auth.ok) { res.status(403).json({ error: 'Forbidden' }); return; }
  try {
    const history = await db('position_history')
      .where({ campaign_id: req.params.id })
      .orderBy('created_at', 'desc');
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/trajectory-matrix
router.get('/:id/trajectory-matrix', async (req, res) => {
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
        .select('ph.character_id', 'ph.scene_id', 'ph.story_time_entered', 'ph.story_time_left', 'ph.move_type', 's.name as scene_name')
        .orderBy('ph.created_at', 'asc'),
    ]);

    const matrix: Record<string, Array<{
      scene_id: string;
      scene_name: string;
      from_time: StoryTime;
      to_time: StoryTime | null;
      move_type: string;
    }>> = {};

    for (const char of characters as Array<{ id: string }>) {
      matrix[char.id] = [];
    }

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
      matrix[charId].push({
        scene_id: String(row['scene_id']),
        scene_name: String(row['scene_name'] ?? row['scene_id']),
        from_time: fromTime,
        to_time: toTime,
        move_type: String(row['move_type'] ?? 'scheduled'),
      });
    }

    const fallbackNow = parseStoryTime(campaign?.global_story_time) ?? { day: 1, hour: 8, minute: 0 };
    if (!Number.isFinite(minMinutes)) {
      minMinutes = toStoryMinutes(fallbackNow);
      maxMinutes = minMinutes;
    }

    const axisStart = Math.floor(minMinutes / 60) * 60;
    const axisEnd = Math.ceil(maxMinutes / 60) * 60;
    const time_axis: Array<{ day: number; hour: number }> = [];
    for (let m = axisStart; m <= axisEnd; m += 60) {
      const day = Math.floor(m / (24 * 60)) + 1;
      const hour = Math.floor((m % (24 * 60)) / 60);
      time_axis.push({ day, hour });
    }

    res.json({
      time_axis,
      characters: (characters as Array<{ id: string; name: string }>).map((c) => ({ id: c.id, name: c.name })),
      matrix,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/my-virtual-scenes — 当前用户参与的 virtual 场景 ID 列表
router.get('/:id/my-virtual-scenes', async (req, res) => {
  try {
    const campaignId = req.params.id!;
    const userId = req.user!.id;
    // 当前用户在本团的角色
    const charRows = await db('character_sheets')
      .where({ user_id: userId })
      .join('character_scene_states', 'character_sheets.id', 'character_scene_states.character_id')
      .where('character_scene_states.campaign_id', campaignId)
      .select('character_sheets.id as char_id');
    const charIds = (charRows as { char_id: string }[]).map((r) => r.char_id);
    if (charIds.length === 0) { res.json([]); return; }

    // 查询参与的 virtual 场景
    const pRows = await db('scene_participations as sp')
      .join('scenes as s', 's.id', 'sp.scene_id')
      .whereIn('sp.character_id', charIds)
      .whereNull('sp.left_at')
      .where('s.type', 'virtual')
      .where('s.campaign_id', campaignId)
      .select('sp.scene_id');
    const sceneIds = [...new Set((pRows as { scene_id: string }[]).map((r) => r.scene_id))];
    res.json(sceneIds);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/characters — 获取团内所有角色及其当前场景（含在线状态）
router.get('/:id/characters', async (req, res) => {
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
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/characters/:charId — GM 查看指定角色卡（含属性）
router.get('/:id/characters/:charId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

    const state = await db('character_scene_states')
      .where({ character_id: req.params.charId, campaign_id: req.params.id })
      .first();
    if (!state) { res.status(404).json({ error: 'Character not in campaign' }); return; }

    // 仅 GM 或角色主人可查看
    const sheet = await db('character_sheets').where({ id: req.params.charId }).first();
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== req.user!.id && campaign.gm_user_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }

    const parseJson = (val: unknown) => safeJsonParse(val, null);

    res.json({
      id: sheet.id,
      name: sheet.name,
      ruleset_id: sheet.ruleset_id,
      occupation_id: sheet.occupation_id,
      avatar_url: sheet.avatar_url || '',
      attributes: parseJson(sheet.attributes) ?? {},
      skills: parseJson(sheet.skills) ?? {},
      background: sheet.background || '',
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// POST /api/campaigns/:id/force-move — GM 强制移动角色
router.post('/:id/force-move', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can force move characters' }); return; }

    const { character_id, to_scene_id } = req.body;
    if (!character_id || !to_scene_id) {
      res.status(400).json({ error: 'character_id and to_scene_id are required' }); return;
    }

    const { forceMove } = await import('../services/movement.js');
    const result = await forceMove(character_id, to_scene_id, req.params.id, req.user!.id);
    res.json({ character_id, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Force move failed' });
  }
});

// GET /api/campaigns/:id/scheduled-moves
router.get('/:id/scheduled-moves', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can view scheduled moves' }); return; }

    const status = req.query['status'];
    const moves = await scheduledMoveService.listByCampaign({
      campaign_id: req.params.id,
      status: typeof status === 'string' ? status as 'pending' | 'approved' | 'cancelled' : undefined,
    });
    res.json(moves);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// ── 时间/移动 REST API ──────────────────────────────────────────────────────

// POST /api/campaigns/:id/time/announce — GM 宣布剧情时间
router.post('/:id/time/announce', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { announceTime } = await import('../services/time.js');
    const sceneId = String(req.body.scene_id ?? '');
    const timeLabel = String(req.body.time_label ?? '');
    const result = await announceTime(req.params.id, sceneId, timeLabel, req.user!.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Time announce failed' });
  }
});

// GET /api/campaigns/:id/moves — 获取移动列表
router.get('/:id/moves', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { listMoves } = await import('../services/movement.js');
    const moves = await listMoves(req.params.id, req.query.status as string | undefined);
    res.json(moves);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// POST /api/campaigns/:id/moves/request — 玩家申请移动
router.post('/:id/moves/request', async (req, res) => {
  try {
    const { character_id, to_scene_id } = req.body;
    const transportMode = (req.body.transport_mode ?? 'walk') as 'walk' | 'bike' | 'drive';
    if (!character_id || !to_scene_id) { res.status(400).json({ error: 'character_id and to_scene_id are required' }); return; }

    const character = await db('character_sheets').where({ id: character_id }).select('user_id').first();
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id', 'global_story_time').first();
    if (!character || !campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (character.user_id !== req.user!.id && campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

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
        .where({ campaign_id: req.params.id, from_scene_id: to_scene_id, to_scene_id: fromSceneId, is_bidirectional: true })
        .first();
      const conn = direct ?? reverse;
      if (!conn) {
        res.status(400).json({ error: '没有到达该场景的已知路线' });
        return;
      }

      if (transportMode === 'bike' && conn.bike_duration != null) travelDuration = Number(conn.bike_duration);
      else if (transportMode === 'drive' && conn.drive_duration != null) travelDuration = Number(conn.drive_duration);
      else travelDuration = Number(conn.walk_duration ?? 0);
    }

    const { requestMove } = await import('../services/movement.js');
    let moveRecord;
    try {
      const result = await requestMove(character_id, req.params.id, to_scene_id);
      moveRecord = result.record;
    } catch (moveErr: any) {
      res.status(400).json({ error: moveErr?.message ?? 'Move request denied' });
      return;
    }
    res.status(201).json({
      ...moveRecord,
      from_scene_id: fromSceneId,
      transport_mode: transportMode,
      travel_duration: travelDuration,
      execute_at_story: null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Request failed' });
  }
});

// POST /api/campaigns/:id/moves/:moveId/approve — GM 批准移动
router.post('/:id/moves/:moveId/approve', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { approveMove } = await import('../services/movement.js');
    const result = await approveMove(req.params.moveId!, req.user!.id, req.body.story_arrival_time ?? null);
    if (!result.record) { res.status(404).json({ error: 'Move not found' }); return; }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Approve failed' });
  }
});

// POST /api/campaigns/:id/moves/:moveId/reject — GM 拒绝移动
router.post('/:id/moves/:moveId/reject', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { rejectMove } = await import('../services/movement.js');
    const move = await rejectMove(req.params.moveId!, req.user!.id);
    if (!move) { res.status(404).json({ error: 'Move not found' }); return; }
    res.json(move);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Reject failed' });
  }
});

// POST /api/campaigns/:id/moves/force — GM 强制立即移动
router.post('/:id/moves/force', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { character_id, to_scene_id } = req.body;
    if (!character_id || !to_scene_id) { res.status(400).json({ error: 'Missing fields' }); return; }
    const { forceMove } = await import('../services/movement.js');
    const result = await forceMove(character_id, to_scene_id, req.params.id, req.user!.id);

    // 插入系统过渡消息到聊天流
    const toScene = await db('scenes').where({ id: to_scene_id }).select('name').first().catch(() => null);
    const fromScene = result.from_scene_id ? await db('scenes').where({ id: result.from_scene_id }).select('name').first().catch(() => null) : null;
    const charSheet = await db('character_sheets').where({ id: character_id }).select('name').first().catch(() => null);
    const transitionContent = fromScene
      ? `${charSheet?.name ?? '角色'} 离开 ${fromScene.name}，前往 ${toScene?.name ?? '目标场景'}`
      : `${charSheet?.name ?? '角色'} 前往 ${toScene?.name ?? '目标场景'}`;
    const sysMsg = {
      id: String(snowflake.nextId()),
      scene_id: to_scene_id,
      campaign_id: req.params.id,
      sender_user_id: req.user!.id,
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
    roomNsp.to(`campaign:${req.params.id}`).emit('new_message', sysMsg);
    roomNsp.to(`campaign:${req.params.id}`).emit('position_changed', {
      character_id,
      from_scene_id: result.from_scene_id ?? '',
      to_scene_id: result.to_scene_id,
      move_type: 'force_move',
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Force move failed' });
  }
});

// GET /api/campaigns/:id/clues
router.get('/:id/clues', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

    let clues;
    if (campaign.gm_user_id === req.user!.id) {
      clues = await clueService.listByCampaign(req.params.id);
    } else {
      const charRows = await db('character_sheets as cs')
        .join('character_scene_states as css', 'css.character_id', 'cs.id')
        .where('css.campaign_id', req.params.id)
        .where('cs.user_id', req.user!.id)
        .select('cs.id');
      const charIds = (charRows as Array<{ id: string }>).map((row) => row.id);
      clues = await clueService.listVisibleToCharacters(req.params.id, charIds);
    }

    res.json(clues);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/clues/:clueId
router.get('/:id/clues/:clueId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }

    const clue = await clueService.getById(req.params.clueId);
    if (!clue || clue.campaign_id !== req.params.id) { res.status(404).json({ error: 'Clue not found' }); return; }

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
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// POST /api/campaigns/:id/clues
router.post('/:id/clues', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can create clues' }); return; }

    const { title, content, theme, is_revealed, revealed_to } = req.body as {
      title?: string;
      content?: string;
      theme?: 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';
      is_revealed?: boolean;
      revealed_to?: string[] | null;
    };
    if (!title || !content || !theme) { res.status(400).json({ error: 'title, content and theme are required' }); return; }

    const clue = await clueService.create({
      campaign_id: req.params.id,
      title,
      content,
      theme,
      is_revealed,
      revealed_to,
    });
    res.status(201).json(clue);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// PUT /api/campaigns/:id/clues/:clueId
router.put('/:id/clues/:clueId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can update clues' }); return; }

    const clue = await clueService.update(req.params.clueId, req.body ?? {});
    if (!clue) { res.status(404).json({ error: 'Clue not found' }); return; }
    res.json(clue);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// POST /api/campaigns/:id/clues/:clueId/reveal
router.post('/:id/clues/:clueId/reveal', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can reveal clues' }); return; }

    const characterIds = Array.isArray(req.body?.character_ids)
      ? req.body.character_ids.filter((id: unknown) => typeof id === 'string' && id.length > 0)
      : [];
    if (characterIds.length === 0) { res.status(400).json({ error: 'character_ids is required' }); return; }

    const clue = await clueService.revealToCharacters(req.params.clueId, characterIds);
    if (!clue) { res.status(404).json({ error: 'Clue not found' }); return; }
    res.json(clue);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Reveal failed' });
  }
});

// PATCH /api/campaigns/:id/clues/:clueId/style
router.patch('/:id/clues/:clueId/style', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can update clue style' }); return; }

    const validThemes = ['river', 'blur', 'fragment', 'wave', 'ancient', 'blood', 'ash', 'cyber'];
    const { theme } = req.body;
    if (!theme || !validThemes.includes(theme)) {
      res.status(400).json({ error: `Invalid theme. Must be one of: ${validThemes.join(', ')}` });
      return;
    }

    const updated = await db('campaign_clues')
      .where({ id: req.params.clueId, campaign_id: req.params.id })
      .update({ theme });

    if (!updated) { res.status(404).json({ error: 'Clue not found' }); return; }

    const clue = await db('campaign_clues').where({ id: req.params.clueId }).first();
    res.json(clue);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error)?.message ?? 'Update failed' });
  }
});

// DELETE /api/campaigns/:id/clues/:clueId
router.delete('/:id/clues/:clueId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can delete clues' }); return; }

    const deleted = await clueService.delete(req.params.clueId);
    if (!deleted) { res.status(404).json({ error: 'Clue not found' }); return; }
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Delete failed' });
  }
});

export default router;
