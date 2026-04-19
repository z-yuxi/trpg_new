import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { moduleService } from '../services/module-service';
import { db } from '../db';
import type { CreateModuleRequest, UpdateModuleRequest, AutoSaveModuleRequest } from '@trpg/shared';

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

// 获取单个模组（含 content）
router.get('/:id', async (req, res) => {
  try {
    const data = await moduleService.getById(req.params['id']!);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// 创建模组
router.post('/', authMiddleware, async (req, res) => {
  try {
    const body = req.body as CreateModuleRequest;
    if (!body.name || !body.ruleset_id) {
      return res.status(400).json({ error: 'name and ruleset_id are required' });
    }
    const module = await moduleService.create(req.user!.id, body);
    res.status(201).json(module);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

// 更新模组
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const body = req.body as UpdateModuleRequest;
    const result = await moduleService.update(req.params['id']!, req.user!.id, body);
    if (!result) return res.status(404).json({ error: 'Not found or no permission' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// 自动保存端点（仅更新 content + auto_saved_at）
router.put('/:id/auto-save', authMiddleware, async (req, res) => {
  try {
    const body = req.body as AutoSaveModuleRequest;
    if (!body.content) return res.status(400).json({ error: 'content is required' });
    const ok = await moduleService.autoSave(req.params['id']!, req.user!.id, body.content, body.word_count);
    if (!ok) return res.status(404).json({ error: 'Not found or no permission' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Auto-save failed' });
  }
});

// 删除模组（仅 draft 状态）
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const ok = await moduleService.delete(req.params['id']!, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'Not found, no permission, or not in draft status' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Delete failed' });
  }
});

export default router;