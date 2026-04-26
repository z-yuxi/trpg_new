import { Router, type IRouter } from 'express';
import { z } from 'zod';
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
import { db } from '../db';
import { redis, RedisKeys } from '../db/redis';
import { generateId, snowflake } from '@trpg/shared';
import { io } from '../app';

const router: IRouter = Router();

// 所有战役路由都需要认证
router.use(authMiddleware);

const createSchema = z.object({
  name: z.string().min(1),
  ruleset_id: z.string().min(1),
  module_id: z.string().optional(),
});

const sceneObPermissionSchema = z.object({
  user_id: z.string().min(1),
});

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
    const campaign = await campaignService.create({ ...parsed.data, gm_user_id: req.user!.id });
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

// POST /api/campaigns/join（必须在 /:id 之前注册）
router.post('/join', async (req, res) => {
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
    const updated = await campaignService.update(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// GET /api/campaigns/:id/scenes
router.get('/:id/scenes', async (req, res) => {
  try {
    const scenes = await campaignService.listScenes(req.params.id);
    res.json(scenes);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/scenes/:sceneId/grid-map
router.get('/:id/scenes/:sceneId/grid-map', async (req, res) => {
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
    };

    const map = await campaignService.updateGridMap(req.params.id, req.params.sceneId, body);
    res.json(map);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// POST /api/campaigns/:id/scenes
router.post('/:id/scenes', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can create scenes' }); return; }
    const id = generateId();
    await db('scenes').insert({
      id,
      campaign_id: req.params.id,
      name: req.body.name,
      type: req.body.type,
      description: req.body.description ?? '',
      created_by: req.user!.id,
    });
    const scene = await db('scenes').where({ id }).first();
    res.status(201).json(scene);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
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
    // 检查是否有角色当前在此场景
    const occupants = await db('character_scene_states')
      .where({ current_spatial_scene_id: req.params.sceneId }).count('id as cnt').first();
    if (Number(occupants?.cnt ?? 0) > 0) {
      res.status(409).json({ error: '场景中仍有角色，无法删除' }); return;
    }
    await db('scenes').where({ id: req.params.sceneId, campaign_id: req.params.id }).delete();
    res.status(204).end();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Delete failed' });
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
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can create NPCs' }); return; }
    const id = generateId();
    await db('campaign_npcs').insert({ id, campaign_id: req.params.id, created_by: req.user!.id, ...req.body });
    const npc = await db('campaign_npcs').where({ id }).first();
    res.status(201).json(npc);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// GET /api/campaigns/:id/npcs
router.get('/:id/npcs', async (req, res) => {
  try {
    const npcs = await db('campaign_npcs').where({ campaign_id: req.params.id });
    res.json(npcs);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// PUT /api/campaigns/:id/npcs/:npcId
router.put('/:id/npcs/:npcId', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can update NPCs' }); return; }
    await db('campaign_npcs').where({ id: req.params.npcId, campaign_id: req.params.id }).update(req.body);
    const npc = await db('campaign_npcs').where({ id: req.params.npcId }).first();
    res.json(npc ?? { error: 'Not found' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// GET /api/campaigns/:id/messages
router.get('/:id/messages', async (req, res) => {
  try {
    const campaignId = req.params.id!;
    const userId = req.user!.id;

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
          // 查询用户角色进入该场景的时间（scene_participations）
          if (scene.history_visibility === 'none') {
            // 只返回用户加入后产生的消息
            const joinRecord = await db('scene_participations')
              .whereIn('character_id', userCharIds.length ? userCharIds : ['__none__'])
              .where({ scene_id: sceneId })
              .orderBy('joined_at', 'asc')
              .first()
              .catch(() => null);
            if (joinRecord?.joined_at) {
              query = query.where('created_at', '>=', joinRecord.joined_at);
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
      visible_to: m['visible_to'] ? JSON.parse(m['visible_to'] as string) : null,
      story_time: m['story_time'] ? JSON.parse(m['story_time'] as string) : null,
      metadata: m['metadata'] ? JSON.parse(m['metadata'] as string) : null,
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
  try {
    const state = await db('campaign_round_state').where({ campaign_id: req.params.id }).first() ?? null;
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/campaigns/:id/position-history
router.get('/:id/position-history', async (req, res) => {
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
        personal_story_time: row['personal_story_time']
          ? (typeof row['personal_story_time'] === 'string' ? JSON.parse(row['personal_story_time'] as string) : row['personal_story_time'])
          : null,
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

    const parseJson = (val: unknown) =>
      typeof val === 'string' ? JSON.parse(val as string) : val;

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
    const move = await requestMove(character_id, req.params.id, to_scene_id);
    res.status(201).json({
      ...move,
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
