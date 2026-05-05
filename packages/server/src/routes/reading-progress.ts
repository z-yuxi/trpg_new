/**
 * GET  /api/reading-progress/:type/:assetId — 获取阅读进度
 * PUT  /api/reading-progress/:type/:assetId — 更新阅读进度
 *
 * 仅已登录用户可用。阅读进度存储为 0-100 整数百分比，用于实现「回到上次阅读位置」。
 */
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { db } from '../db';
import { generateId } from '@trpg/shared';

const router: IRouter = Router();

const VALID_TYPES = new Set(['module', 'ruleset']);

const putSchema = z.object({
  scroll_percent: z.number().int().min(0).max(100),
});

// GET /api/reading-progress/:type/:assetId
router.get('/:type/:assetId', authMiddleware, async (req, res): Promise<void> => {
  const { type, assetId } = req.params as { type: string; assetId: string };
  if (!VALID_TYPES.has(type)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  try {
    const row = await db('reading_progress')
      .where({ user_id: getAuthedUser(req).id, asset_type: type, asset_id: assetId })
      .select('scroll_percent', 'updated_at')
      .first();
    res.json(row ?? null);
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ error: e.message ?? 'Query failed' });
  }
});

// PUT /api/reading-progress/:type/:assetId
router.put('/:type/:assetId', authMiddleware, async (req, res): Promise<void> => {
  const { type, assetId } = req.params as { type: string; assetId: string };
  if (!VALID_TYPES.has(type)) {
    res.status(400).json({ error: 'Invalid asset type' });
    return;
  }
  const parsed = putSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const existing = await db('reading_progress')
      .where({ user_id: getAuthedUser(req).id, asset_type: type, asset_id: assetId })
      .first();

    if (existing) {
      await db('reading_progress')
        .where({ user_id: getAuthedUser(req).id, asset_type: type, asset_id: assetId })
        .update({ scroll_percent: parsed.data.scroll_percent, updated_at: new Date() });
    } else {
      await db('reading_progress').insert({
        id: generateId(),
        user_id: getAuthedUser(req).id,
        asset_type: type,
        asset_id: assetId,
        scroll_percent: parsed.data.scroll_percent,
        updated_at: new Date(),
      });
    }
    res.json({ scroll_percent: parsed.data.scroll_percent });
  } catch (err: unknown) {
    const e = err as { message?: string };
    res.status(500).json({ error: e.message ?? 'Save failed' });
  }
});

export default router;
