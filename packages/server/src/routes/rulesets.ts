import { Router, type IRouter } from 'express';
const router: IRouter = Router();

// GET /api/rulesets — 公开规则集列表（无需认证）
router.get('/', (_req, res) => { res.json([]); });
// GET /api/rulesets/:id
router.get('/:id', (_req, res) => { res.status(404).json({ error: 'Not found' }); });
// PUT /api/rulesets/:id - 更新规则集
router.put('/:id', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/rulesets/:id/execute - 执行规则命令
router.post('/:id/execute', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
