/**
 * /api/occupations — 职业模板 CRUD
 *
 * 路由设计：
 *   GET    /api/occupations?ruleset_id=xxx        查询某规则集下的所有职业模板（公开访问）
 *   GET    /api/occupations/:id                   获取单个职业模板
 *   POST   /api/occupations                       创建职业模板（需登录 + 是规则集作者/管理员）
 *   PUT    /api/occupations/:id                   更新职业模板（需登录 + 作者）
 *   DELETE /api/occupations/:id                   删除职业模板（需登录 + 作者）
 */
import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { OccupationTemplate } from '@trpg/shared';
import { safeErrorMessage } from '../utils/error-response';

const router: IRouter = Router();

// ── 读取操作（无需认证） ─────────────────────────────────────────────────────

// GET /api/occupations?ruleset_id=xxx
router.get('/', async (req, res): Promise<void> => {
  try {
    const { ruleset_id } = req.query as Record<string, string>;
    if (!ruleset_id) {
      res.status(400).json({ error: 'ruleset_id is required' });
      return;
    }
    const rows = await db('occupation_templates')
      .where({ ruleset_id })
      .orderBy('created_at', 'asc');
    res.json(rows.map(deserialize));
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// GET /api/occupations/:id
router.get('/:id', async (req, res): Promise<void> => {
  try {
    const row = await db('occupation_templates').where({ id: req.params['id'] }).first();
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(deserialize(row));
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// ── 写操作（需登录）────────────────────────────────────────────────────────────

// POST /api/occupations
router.post('/', authMiddleware, async (req, res): Promise<void> => {
  try {
    const body = req.body as Partial<OccupationTemplate>;
    if (!body.ruleset_id || !body.name) {
      res.status(400).json({ error: 'ruleset_id and name are required' });
      return;
    }
    // 鉴权：规则集必须属于当前用户
    const ruleset = await db('rulesets').where({ id: body.ruleset_id }).select('author_id').first();
    if (!ruleset) { res.status(404).json({ error: 'Ruleset not found' }); return; }
    if (ruleset.author_id !== req.user!.id) {
      res.status(403).json({ error: 'Only ruleset author can create occupation templates' });
      return;
    }
    const id = generateId();
    await db('occupation_templates').insert({
      id,
      ruleset_id: body.ruleset_id,
      name: body.name,
      description: body.description ?? '',
      mode: body.mode ?? 'static',
      attribute_growth: body.attribute_growth ? JSON.stringify(body.attribute_growth) : null,
      skill_point_formula: body.skill_point_formula ?? null,
      credit_rating: body.credit_rating ? JSON.stringify(body.credit_rating) : null,
      occupation_skills: body.occupation_skills ? JSON.stringify(body.occupation_skills) : null,
      progression_table: body.progression_table ? JSON.stringify(body.progression_table) : null,
      feature_graph: body.feature_graph ? JSON.stringify(body.feature_graph) : null,
      starting_equipment: body.starting_equipment ? JSON.stringify(body.starting_equipment) : null,
    });
    const row = await db('occupation_templates').where({ id }).first();
    res.status(201).json(deserialize(row));
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Create failed') });
  }
});

// PUT /api/occupations/:id
router.put('/:id', authMiddleware, async (req, res): Promise<void> => {
  try {
    const row = await db('occupation_templates').where({ id: req.params['id'] }).first();
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    // 鉴权：规则集必须属于当前用户
    const ruleset = await db('rulesets').where({ id: row.ruleset_id }).select('author_id').first();
    if (!ruleset || ruleset.author_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const body = req.body as Partial<OccupationTemplate>;
    const updates: Record<string, unknown> = { updated_at: db.fn.now() };
    if (body.name !== undefined) updates['name'] = body.name;
    if (body.description !== undefined) updates['description'] = body.description;
    if (body.mode !== undefined) updates['mode'] = body.mode;
    if (body.attribute_growth !== undefined) updates['attribute_growth'] = JSON.stringify(body.attribute_growth);
    if (body.skill_point_formula !== undefined) updates['skill_point_formula'] = body.skill_point_formula;
    if (body.credit_rating !== undefined) updates['credit_rating'] = JSON.stringify(body.credit_rating);
    if (body.occupation_skills !== undefined) updates['occupation_skills'] = JSON.stringify(body.occupation_skills);
    if (body.progression_table !== undefined) updates['progression_table'] = JSON.stringify(body.progression_table);
    if (body.feature_graph !== undefined) updates['feature_graph'] = JSON.stringify(body.feature_graph);
    if (body.starting_equipment !== undefined) updates['starting_equipment'] = JSON.stringify(body.starting_equipment);
    await db('occupation_templates').where({ id: req.params['id'] }).update(updates);
    const updated = await db('occupation_templates').where({ id: req.params['id'] }).first();
    res.json(deserialize(updated));
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Update failed') });
  }
});

// DELETE /api/occupations/:id
router.delete('/:id', authMiddleware, async (req, res): Promise<void> => {
  try {
    const row = await db('occupation_templates').where({ id: req.params['id'] }).first();
    if (!row) { res.status(404).json({ error: 'Not found' }); return; }
    const ruleset = await db('rulesets').where({ id: row.ruleset_id }).select('author_id').first();
    if (!ruleset || ruleset.author_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await db('occupation_templates').where({ id: req.params['id'] }).delete();
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Delete failed') });
  }
});

// ── 辅助函数 ────────────────────────────────────────────────────────────────

/** 将数据库行的 JSON 字段解析为对象 */
function deserialize(row: Record<string, unknown>): OccupationTemplate {
  const parseJson = (v: unknown) => {
    if (v == null) return undefined;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return undefined; } }
    return v;
  };
  return {
    id: row['id'] as string,
    ruleset_id: row['ruleset_id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string) ?? '',
    mode: (row['mode'] as 'static' | 'leveled') ?? 'static',
    attribute_growth: parseJson(row['attribute_growth']),
    skill_point_formula: (row['skill_point_formula'] as string | undefined) ?? undefined,
    credit_rating: parseJson(row['credit_rating']),
    occupation_skills: parseJson(row['occupation_skills']),
    progression_table: parseJson(row['progression_table']),
    feature_graph: parseJson(row['feature_graph']),
    starting_equipment: parseJson(row['starting_equipment']),
    created_at: row['created_at'] as Date,
    updated_at: row['updated_at'] as Date,
  };
}

export default router;
