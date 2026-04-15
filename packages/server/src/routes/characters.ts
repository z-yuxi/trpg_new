import { Router, type IRouter } from 'express';
const router: IRouter = Router();

// POST /api/characters/import - 导入 CSON（必须在 /:id 之前注册）
router.post('/import', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/characters - 创建角色卡
router.post('/', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/characters - 我的角色卡列表
router.get('/', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// GET /api/characters/:id - 角色卡详情
router.get('/:id', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// PUT /api/characters/:id - 更新角色卡
router.put('/:id', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// DELETE /api/characters/:id - 删除角色卡
router.delete('/:id', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });
// POST /api/characters/:id/export - 导出 CSON
router.post('/:id/export', (_req, res) => { res.status(501).json({ error: 'Not implemented' }); });

export default router;
