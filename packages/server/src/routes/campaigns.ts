import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { campaignService } from '../services/campaign-service';
import { db } from '../db';
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

// POST /api/campaigns/:id/scenes
router.post('/:id/scenes', async (req, res) => {
  try {
    const id = generateId();
    await db('scenes').insert({ id, campaign_id: req.params.id, ...req.body });
    const scene = await db('scenes').where({ id }).first();
    res.status(201).json(scene);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// POST /api/campaigns/:id/scenes/connections
router.post('/:id/scenes/connections', async (req, res) => {
  try {
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
    let query = db('chat_messages')
      .where({ campaign_id: req.params.id })
      .orderBy('id', 'asc')
      .limit(50);
    if (req.query.after_id) {
      query = (query as any).where('id', '>', String(req.query.after_id));
    }
    if (req.query.scene_id) {
      query = query.where({ scene_id: req.query.scene_id });
    }
    const messages = await query;
    res.json(messages.map((m: Record<string, unknown>) => ({
      ...m,
      id: m.id?.toString(),
      visible_to: m.visible_to ? JSON.parse(m.visible_to as string) : null,
      story_time: m.story_time ? JSON.parse(m.story_time as string) : null,
      metadata: m.metadata ? JSON.parse(m.metadata as string) : null,
    })));
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

export default router;
