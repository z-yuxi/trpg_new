import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { characterSheetService } from '../services/character-sheet-service';
import { exportCSON, importCSON } from '@trpg/shared';

const router: IRouter = Router();

router.use(authMiddleware);

// POST /api/characters/import - 导入 CSON（必须在 /:id 之前注册）
router.post('/import', async (req, res) => {
  try {
    const { cson_text } = req.body;
    if (!cson_text) { res.status(400).json({ error: 'cson_text is required' }); return; }
    const parsed = importCSON(cson_text);
    const sheet = await characterSheetService.create({
      user_id: req.user!.id,
      ruleset_id: parsed.ruleset_id,
      name: parsed.name,
      occupation_id: parsed.occupation_id,
      attributes: parsed.attributes,
      skills: parsed.skills,
    });
    res.status(201).json(sheet);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Import failed' });
  }
});

// POST /api/characters - 创建角色卡
router.post('/', async (req, res) => {
  try {
    const sheet = await characterSheetService.create({ ...req.body, user_id: req.user!.id });
    res.status(201).json(sheet);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// GET /api/characters - 我的角色卡列表
router.get('/', async (req, res) => {
  try {
    const sheets = await characterSheetService.findByUserId(req.user!.id);
    res.json(sheets);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/characters/:id - 角色卡详情
router.get('/:id', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    res.json(sheet);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// PUT /api/characters/:id - 更新角色卡
router.put('/:id', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const updated = await characterSheetService.update(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// DELETE /api/characters/:id - 删除角色卡
router.delete('/:id', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    await characterSheetService.delete(req.params.id);
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Delete failed' });
  }
});

// POST /api/characters/:id/export - 导出 CSON
router.post('/:id/export', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const cson_text = exportCSON(sheet, req.user!.nickname ?? 'player');
    res.json({ cson_text });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Export failed' });
  }
});

export default router;
