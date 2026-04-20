import { Router, type IRouter } from 'express';
import { z } from 'zod';
import type { GridToken } from '@trpg/shared';
import { authMiddleware } from '../middleware/auth';
import { campaignService, scheduledMoveService } from '../services/campaign-service';
import { clueService } from '../services/clue-service';
import { characterInstanceService } from '../services/character-sheet-service';
import { db } from '../db';
import { redis, RedisKeys } from '../db/redis';
import { generateId } from '@trpg/shared';

const router: IRouter = Router();

// 所有战役路由都需要认证
router.use(authMiddleware);

const createSchema = z.object({
  name: z.string().min(1),
  ruleset_id: z.string().min(1),
  module_id: z.string().optional(),
});

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
    await db('scenes').insert({ id, campaign_id: req.params.id, name: req.body.name, type: req.body.type, description: req.body.description ?? '' });
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

// POST /api/campaigns/:id/scenes/connections
router.post('/:id/scenes/connections', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Campaign not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can create scene connections' }); return; }
    const id = generateId();
    await db('scene_connections').insert({ id, campaign_id: req.params.id, created_by: req.user!.id, ...req.body });
    const conn = await db('scene_connections').where({ id }).first();
    res.status(201).json(conn);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// GET /api/campaigns/:id/scenes/connections
router.get('/:id/scenes/connections', async (req, res) => {
  try {
    const connections = await db('scene_connections').where({ campaign_id: req.params.id });
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
    if (!isGm) {
      const charRows = await db('character_sheets')
        .where({ user_id: userId })
        .join('character_scene_states', 'character_sheets.id', 'character_scene_states.character_id')
        .where('character_scene_states.campaign_id', campaignId)
        .select('character_sheets.id as char_id');
      userCharIds = (charRows as { char_id: string }[]).map((r) => r.char_id);
    }

    let query = db('chat_messages')
      .where({ campaign_id: campaignId })
      .orderBy('id', 'asc')
      .limit(50);
    if (req.query.after_id) {
      query = (query as any).where('id', '>', String(req.query.after_id));
    }
    const sceneId = req.query.scene_id as string | undefined;
    if (sceneId) {
      query = query.where({ scene_id: sceneId });

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
            query = db('chat_messages')
              .where({ campaign_id: campaignId, scene_id: sceneId })
              .orderBy('id', 'desc')
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

    const state = await db('character_scene_states')
      .where({ character_id, campaign_id: req.params.id })
      .first();
    if (!state) { res.status(404).json({ error: 'Character not in campaign' }); return; }

    const fromSceneId = state.current_spatial_scene_id ?? '';

    await db('character_scene_states')
      .where({ character_id, campaign_id: req.params.id })
      .update({ current_spatial_scene_id: to_scene_id });

    const { generateId } = await import('@trpg/shared');
    await db('position_history').insert({
      id: generateId(),
      campaign_id: req.params.id,
      character_id,
      scene_id: to_scene_id,
      story_time_entered: JSON.stringify({}),
      story_time_left: null,
      move_type: 'force_move',
    });

    res.json({ character_id, from_scene_id: fromSceneId, to_scene_id });
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

// POST /api/campaigns/:id/time/advance — GM 推进故事时间
router.post('/:id/time/advance', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM' }); return; }
    const { advanceTime } = await import('../services/time.js');
    const result = await advanceTime(req.params.id, req.body.delta ?? {}, req.user!.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Time advance failed' });
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

// POST /api/campaigns/:id/moves/request — 玩家预约移动
router.post('/:id/moves/request', async (req, res) => {
  try {
    const { character_id, to_scene_id, execute_at_story } = req.body;
    if (!character_id || !to_scene_id || !execute_at_story) { res.status(400).json({ error: 'Missing fields' }); return; }
    const character = await db('character_sheets').where({ id: character_id }).select('user_id').first();
    const campaign = await db('campaigns').where({ id: req.params.id }).select('gm_user_id').first();
    if (!character || !campaign) { res.status(404).json({ error: 'Not found' }); return; }
    if (character.user_id !== req.user!.id && campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const { requestMove } = await import('../services/movement.js');
    const move = await requestMove(character_id, req.params.id, to_scene_id, execute_at_story);
    res.status(201).json(move);
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
    const move = await approveMove(req.params.moveId!, req.user!.id);
    if (!move) { res.status(404).json({ error: 'Move not found' }); return; }
    res.json(move);
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
    if (campaign.gm_user_id !== req.user!.id) { res.status(403).json({ error: 'Only GM can view clues' }); return; }

    const clues = await clueService.listByCampaign(req.params.id);
    res.json(clues);
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

export default router;
