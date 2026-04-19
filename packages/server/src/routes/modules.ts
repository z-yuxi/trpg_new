import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { moduleService } from '../services/module-service';
import { db } from '../db';

const router: IRouter = Router();

router.get('/', async (req, res) => {
  try {
    const firstUser = await db('users').select('id').orderBy('uid', 'asc').first();
    if (firstUser?.id) {
      await moduleService.seedIfEmpty(firstUser.id as string);
    }

    const result = await moduleService.listPublic({
      keyword: typeof req.query['keyword'] === 'string' ? req.query['keyword'] : undefined,
      ruleset_id: typeof req.query['ruleset_id'] === 'string' ? req.query['ruleset_id'] : undefined,
      sort: typeof req.query['sort'] === 'string' ? req.query['sort'] as 'hot' | 'new' | 'rating' : 'hot',
      page: Number(req.query['page'] ?? 1),
      limit: Number(req.query['limit'] ?? 20),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const data = await moduleService.listMine(req.user!.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

export default router;