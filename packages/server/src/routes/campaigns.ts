import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { campaignService } from '../services/campaign-service';

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

// 其余端点（NPC/消息历史/回合状态/位置历史）暂返回空列表
router.post('/:id/scenes', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
router.post('/:id/scenes/connections', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
router.get('/:id/scenes/connections', (_req, res) => res.json([]));
router.post('/:id/npcs', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
router.get('/:id/npcs', (_req, res) => res.json([]));
router.put('/:id/npcs/:npcId', (_req, res) => res.status(501).json({ error: 'Not implemented' }));
router.get('/:id/messages', (_req, res) => res.json([]));
router.get('/:id/round-state', (_req, res) => res.json(null));
router.get('/:id/position-history', (_req, res) => res.json([]));

export default router;
