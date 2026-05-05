/**
 * /api/annotations
 * 划线笔记 CRUD
 */
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { safeErrorMessage } from '../utils/error-response';

const router = Router();

// 所有路由需登录
router.use(authMiddleware);

const ASSET_TYPES = ['module', 'ruleset'] as const;
const COLORS = ['yellow', 'green', 'blue', 'red'] as const;

const createSchema = z.object({
  asset_type: z.enum(ASSET_TYPES),
  asset_id: z.string().min(1).max(20),
  selected_text: z.string().min(1).max(500),
  color: z.enum(COLORS).optional().default('yellow'),
  note: z.string().max(2000).optional().nullable(),
  range_start: z.number().int().min(0),
  range_end: z.number().int().min(0),
});

const updateSchema = z.object({
  color: z.enum(COLORS).optional(),
  note: z.string().max(2000).optional().nullable(),
});

/**
 * GET /api/annotations?asset_type=module&asset_id=xxx
 * 获取当前用户在某资产上的全部划线
 */
router.get('/', async (req, res) => {
  const { asset_type, asset_id } = req.query as Record<string, string>;
  if (!asset_type || !asset_id) {
    res.status(400).json({ error: 'asset_type and asset_id are required' });
    return;
  }
  if (!ASSET_TYPES.includes(asset_type as any)) {
    res.status(400).json({ error: 'invalid asset_type' });
    return;
  }
  try {
    const rows = await db('annotations')
      .where({ user_id: getAuthedUser(req).id, asset_type, asset_id })
      .orderBy('range_start', 'asc');
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

/**
 * POST /api/annotations
 * 新建一条划线
 */
router.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { asset_type, asset_id, selected_text, color, note, range_start, range_end } = parsed.data;
  try {
    const id = uuidv4().replace(/-/g, '').slice(0, 20);
    const now = new Date();
    await db('annotations').insert({
      id,
      user_id: getAuthedUser(req).id,
      asset_type,
      asset_id,
      selected_text,
      color,
      note: note ?? null,
      range_start,
      range_end,
      created_at: now,
      updated_at: now,
    });
    const row = await db('annotations').where({ id }).first();
    res.status(201).json(row);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Insert failed') });
  }
});

/**
 * PATCH /api/annotations/:id
 * 修改划线颜色或笔记内容（仅本人）
 */
router.patch('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const existing = await db('annotations').where({ id: req.params.id, user_id: getAuthedUser(req).id }).first();
    if (!existing) {
      res.status(404).json({ error: 'Annotation not found' });
      return;
    }
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (parsed.data.color !== undefined) updates['color'] = parsed.data.color;
    if (parsed.data.note !== undefined) updates['note'] = parsed.data.note ?? null;
    await db('annotations').where({ id: req.params.id }).update(updates);
    const row = await db('annotations').where({ id: req.params.id }).first();
    res.json(row);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Update failed') });
  }
});

/**
 * DELETE /api/annotations/:id
 * 删除划线（仅本人）
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await db('annotations')
      .where({ id: req.params.id, user_id: getAuthedUser(req).id })
      .delete();
    if (!deleted) {
      res.status(404).json({ error: 'Annotation not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Delete failed') });
  }
});

export default router;
