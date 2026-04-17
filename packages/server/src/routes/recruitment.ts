import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { RecruitmentService } from '../services/recruitment-service';

const router: IRouter = Router();
const recruitmentService = new RecruitmentService();

// POST /api/recruitment - 发布招募帖（需要认证）
router.post('/', authMiddleware, async (req, res) => {
  try {
    const post = await recruitmentService.create({ ...req.body, poster_id: req.user!.id });
    res.status(201).json(post);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// GET /api/recruitment - 招募帖列表（公开）
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const filters = {
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
    };
    const posts = await recruitmentService.list(filters);
    // 手动分页
    const start = (page - 1) * limit;
    res.json({
      data: posts.slice(start, start + limit),
      total: posts.length,
      page,
      limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/recruitment/:id - 招募帖详情（公开）
router.get('/:id', async (req, res) => {
  try {
    const post = await recruitmentService.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(post);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// PUT /api/recruitment/:id - 更新招募帖（需要认证，验证所有权）
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const post = await recruitmentService.findById(req.params.id);
    if (!post) { res.status(404).json({ error: 'Not found' }); return; }
    if (post.poster_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const updated = await recruitmentService.update(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

export default router;
