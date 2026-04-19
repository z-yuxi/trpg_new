import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { userService } from '../services/user-service';
import { forumService } from '../services/forum-service';

const router: IRouter = Router();

// GET /api/users/me/stats
router.get('/me/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await userService.getStats(req.user!.id);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/users/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/users/me
router.put('/me', authMiddleware, async (req, res) => {
  const schema = z.object({
    nickname: z.string().min(1).optional(),
    avatar_url: z.string().min(1).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const user = await userService.updateProfile(req.user!.id, parsed.data);
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// GET /api/users/me/activity
router.get('/me/activity', authMiddleware, async (req, res) => {
  const { page, limit } = req.query as Record<string, string>;
  const result = await forumService.getUserActivity(req.user!.id, {
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });
  res.json(result);
});

router.get('/:uid/profile', async (req, res) => {
  try {
    const profile = await userService.getPublicProfile(req.params.uid);
    if (!profile) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.get('/:uid/campaigns', async (req, res) => {
  try {
    const data = await userService.getUserCampaigns(req.params.uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.get('/:uid/hosted-campaigns', async (req, res) => {
  try {
    const data = await userService.getHostedCampaigns(req.params.uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.get('/:uid/created-modules', async (req, res) => {
  try {
    const data = await userService.getUserCreatedModules(req.params.uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

export default router;
