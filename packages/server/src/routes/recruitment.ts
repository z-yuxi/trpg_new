import { Router, type IRouter } from 'express';
const router: IRouter = Router();

// POST /api/recruitment - 发布招募帖
router.post('/', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/recruitment - 招募帖列表
router.get('/', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/recruitment/:id - 招募帖详情
router.get('/:id', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/recruitment/:id - 更新招募帖
router.put('/:id', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
