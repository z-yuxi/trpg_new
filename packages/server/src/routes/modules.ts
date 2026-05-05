import { Router, type IRouter } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware, requireCreator } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed.js';
import { payGate } from '../middleware/pay-gate';
import { moduleService } from '../services/module-service';
import { createModulePdfBuffer, importModuleFile } from '../services/module-transfer-service';
import { db } from '../db';
import { notificationService } from '../services/notification-service';
import { safeErrorMessage } from '../utils/error-response';
import type { CreateModuleRequest, UpdateModuleRequest, AutoSaveModuleRequest, CommunityUploadRequest } from '@trpg/shared';

const router: IRouter = Router();
// 模组导入允许的扩展名与 MIME 类型（fileFilter 仅做前置过滤，Magic Bytes 校验在 handler 内完成）
const IMPORT_ALLOWED_EXTS = new Set(['.md', '.txt', '.json', '.docx']);
const IMPORT_ALLOWED_MIME_PREFIXES = ['text/', 'application/json', 'application/vnd.openxmlformats'];

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMPORT_ALLOWED_EXTS.has(ext)) {
      cb(new Error('仅支持 .md、.txt、.json、.docx 格式的模组文件'));
      return;
    }
    const mimeOk = IMPORT_ALLOWED_MIME_PREFIXES.some((p) => file.mimetype.startsWith(p));
    if (!mimeOk) {
      cb(new Error('文件 MIME 类型不被支持'));
      return;
    }
    cb(null, true);
  },
});
const importConfirmSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  content: z.string().min(1),
  word_count: z.number().int().nonnegative().optional(),
});

router.get('/', async (req, res) => {
  try {
    // 仅在非生产环境执行种子数据（避免生产环境每次请求都触发）
    if (process.env.NODE_ENV !== 'production') {
      const firstUser = await db('users').select('id').orderBy('uid', 'asc').first();
      if (firstUser?.id) {
        await moduleService.seedIfEmpty(firstUser.id as string);
      }
    }

    const result = await moduleService.listPublic({
      keyword: typeof req.query['keyword'] === 'string' ? req.query['keyword'] : undefined,
      ruleset_id: typeof req.query['ruleset_id'] === 'string' ? req.query['ruleset_id'] : undefined,
      sort: typeof req.query['sort'] === 'string' ? req.query['sort'] as 'hot' | 'new' | 'rating' : 'hot',
      page: Number(req.query['page'] ?? 1),
      limit: Number(req.query['limit'] ?? 20),
    });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const data = await moduleService.listMine(getAuthedUser(req).id);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// GET /api/modules/announcements — 公示处列表（public_notice 与 reviewing 状态）
// 无需认证，公开可见；用于探索页「公示处」Tab
router.get('/announcements', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
    const rows = await db('modules as m')
      .leftJoin('users as u', 'u.id', 'm.author_id')
      .leftJoin('rulesets as r', 'r.id', 'm.ruleset_id')
      .whereIn('m.status', ['public_notice', 'reviewing'])
      .select(
        'm.id', 'm.name', 'm.description', 'm.status', 'm.cover_url',
        'm.author_id', 'm.price', 'm.created_at', 'm.updated_at', 'm.public_notice_end_at',
        'u.nickname as author_name', 'r.name as ruleset_name',
      )
      .orderBy('m.created_at', 'desc')
      .limit(limit);

    const rulesetRows = await db('rulesets as r')
      .leftJoin('users as u', 'u.id', 'r.author_id')
      .whereIn('r.status', ['reviewing'])
      .select('r.id', 'r.name', 'r.description', 'r.status', 'r.author_id', 'r.created_at', 'u.nickname as author_name')
      .orderBy('r.created_at', 'desc')
      .limit(limit);

    res.json({
      modules: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        status: row.status,
        cover_url: row.cover_url ?? null,
        author_id: row.author_id,
        author: row.author_name ?? '佚名',
        price: Number(row.price ?? 0),
        public_notice_end_at: row.public_notice_end_at ?? null,
        type: 'module',
      })),
      rulesets: rulesetRows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? '',
        status: row.status,
        author_id: row.author_id,
        author: row.author_name ?? '佚名',
        type: 'ruleset',
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// 获取单个模组（含 content）
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const data = await moduleService.getById(req.params['id']!);
    if (!data) return res.status(404).json({ error: 'Not found' });
    // 非公开状态的模组需要认证且为作者
    const publicStatuses: string[] = ['public', 'public_notice'];
    if (!publicStatuses.includes(data.status)) {
      if (!req.user || req.user.id !== data.author_id) {
        return res.status(404).json({ error: 'Not found' });
      }
    }
    // 判断当前用户是否已获取该模组（作者/免费/已购均视为已获取）
    let is_owned = data.price === 0; // 免费内容直接已获取
    if (req.user) {
      if (req.user.id === data.author_id) {
        is_owned = true; // 作者本人
      } else if (data.price > 0) {
        const purchase = await db('user_module_purchases')
          .where({ user_id: req.user.id, module_id: data.id })
          .first();
        is_owned = !!purchase;
      }
    }
    res.json({ ...data, is_owned });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

router.post('/:id/import', authMiddleware, (req, res) => {
  importUpload.single('file')(req, res, async (error) => {
    if (error) {
      res.status(400).json({ error: error.message || '导入失败' });
      return;
    }
    try {
      const moduleRow = await db('modules')
        .where({ id: req.params['id']!, author_id: getAuthedUser(req).id })
        .select('id')
        .first();

      if (!moduleRow) {
        res.status(404).json({ error: 'Not found or no permission' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: '缺少上传文件' });
        return;
      }

      const preview = await importModuleFile(req.file.originalname, req.file.mimetype, req.file.buffer);
      res.json(preview);
    } catch (err: unknown) {
      const status = (err instanceof Error && 'status' in err && typeof (err as {status: unknown}).status === 'number')
        ? (err as {status: number}).status : 400;
      res.status(status).json({ error: safeErrorMessage(err, '导入失败') });
    }
  });
});

router.post('/:id/import/confirm', authMiddleware, async (req, res) => {
  const parsed = importConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const module = await moduleService.applyImportedContent(req.params['id']!, getAuthedUser(req).id, parsed.data);
    if (!module) {
      res.status(404).json({ error: 'Not found or no permission' });
      return;
    }
    res.json(module);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Import confirm failed') });
  }
});

router.post('/:id/export/pdf', authMiddleware, payGate('module_pdf'), async (req, res) => {
  try {
    const module = await moduleService.getById(req.params['id']!);
    if (!module) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (module.author_id !== getAuthedUser(req).id && module.status !== 'public') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const pdfBuffer = await createModulePdfBuffer(module);
    const safeName = (module.name || 'module').replace(/[\\/:*?"<>|]+/g, '-');
    const encodedName = encodeURIComponent(`${safeName}.pdf`);

    res.setHeader('Content-Type', 'application/pdf');
    // RFC 5987 编码，支持中文文件名
    res.setHeader('Content-Disposition', `attachment; filename="module.pdf"; filename*=UTF-8''${encodedName}`);
    res.send(pdfBuffer);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Export failed') });
  }
});

// 创建模组（需创作者权限）
router.post('/', authMiddleware, requireCreator, async (req, res) => {
  try {
    const body = req.body as CreateModuleRequest;
    if (!body.name || !body.ruleset_id) {
      return res.status(400).json({ error: 'name and ruleset_id are required' });
    }
    const module = await moduleService.create(getAuthedUser(req).id, body);
    res.status(201).json(module);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Create failed') });
  }
});

// 更新模组（需创作者权限）
router.put('/:id', authMiddleware, requireCreator, async (req, res) => {
  try {
    const body = req.body as UpdateModuleRequest;
    const result = await moduleService.update(req.params['id']!, getAuthedUser(req).id, body);
    if (!result) return res.status(404).json({ error: 'Not found or no permission' });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Update failed') });
  }
});

// 自动保存端点（需创作者权限）
router.put('/:id/auto-save', authMiddleware, requireCreator, async (req, res) => {
  try {
    const body = req.body as AutoSaveModuleRequest;
    if (!body.content) return res.status(400).json({ error: 'content is required' });
    const ok = await moduleService.autoSave(req.params['id']!, getAuthedUser(req).id, body.content, body.word_count);
    if (!ok) return res.status(404).json({ error: 'Not found or no permission' });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Auto-save failed') });
  }
});

// 删除模组（仅 draft 状态，需创作者权限）
router.delete('/:id', authMiddleware, requireCreator, async (req, res) => {
  try {
    const ok = await moduleService.delete(req.params['id']!, getAuthedUser(req).id);
    if (!ok) return res.status(404).json({ error: 'Not found, no permission, or not in draft status' });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Delete failed') });
  }
});

// 提交发布审核（需创作者权限）
router.post('/:id/submit', authMiddleware, requireCreator, async (req, res) => {
  try {
    const module = await moduleService.submitForReview(req.params['id']!, getAuthedUser(req).id);
    if (!module) return res.status(404).json({ error: 'Not found or not in draft status' });
    res.json(module);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Submit failed') });
  }
});

// 撤回模组（需创作者权限）
router.post('/:id/withdraw', authMiddleware, requireCreator, async (req, res) => {
  try {
    const module = await moduleService.withdraw(req.params['id']!, getAuthedUser(req).id);
    if (!module) return res.status(404).json({ error: 'Not found or invalid state' });
    res.json(module);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Withdraw failed') });
  }
});

// 获取公示期信息
router.get('/:id/public-notice', async (req, res) => {
  try {
    const module = await moduleService.getById(req.params['id']!);
    if (!module) return res.status(404).json({ error: 'Not found' });
    if (module.status !== 'public_notice') {
      return res.json({ is_in_notice: false });
    }
    const endAt = module.public_notice_end_at ? new Date(module.public_notice_end_at) : null;
    res.json({
      is_in_notice: true,
      end_at: endAt,
      remaining_ms: endAt ? Math.max(0, endAt.getTime() - Date.now()) : 0,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// 举报模组
const reportSchema = z.object({
  report_type: z.enum(['spam', 'copyright', 'inappropriate', 'misinformation', 'other']),
  description: z.string().min(10).max(1000),
});

router.post('/:id/report', authMiddleware, async (req, res) => {
  try {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const { report_type, description } = parsed.data;
    const { generateId } = await import('@trpg/shared');
    await db('module_reports').insert({
      id: generateId(),
      module_id: req.params['id']!,
      reporter_user_id: getAuthedUser(req).id,
      report_type,
      description,
      status: 'pending',
      created_at: new Date(),
    });
    res.status(201).json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Report failed') });
  }
});

// ── GET /api/modules/:id/terms — 获取模组术语白名单 ──────────────────────────
router.get('/:id/terms', authMiddleware, async (req, res) => {
  const moduleId = req.params['id'];
  const mod = await db('modules').where({ id: moduleId }).first();
  if (!mod) { res.status(404).json({ error: 'Module not found' }); return; }

  const rows = await db('module_terms')
    .where('module_id', moduleId)
    .orderBy('created_at', 'asc')
    .select('id', 'term');

  res.json({ terms: rows });
});

// ── PUT /api/modules/:id/terms — 覆盖保存模组术语白名单（仅模组作者） ─────────
const termsSchema = z.object({
  terms: z.array(z.string().min(1).max(64)).max(100),
});

router.put('/:id/terms', authMiddleware, async (req, res) => {
  const moduleId = req.params['id'];
  const mod = await db('modules').where({ id: moduleId }).first<{ author_id: string }>();
  if (!mod) { res.status(404).json({ error: 'Module not found' }); return; }
  if (mod.author_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }

  const parsed = termsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { terms } = parsed.data;
  // 全量覆盖：先删后插
  await db('module_terms').where('module_id', moduleId).delete();

  if (terms.length > 0) {
    const { generateId } = await import('@trpg/shared');
    const rows = terms.map((term) => ({ id: generateId(), module_id: moduleId, term }));
    await db('module_terms').insert(rows);
  }

  res.json({ terms: terms.map((t) => ({ term: t })) });
});

// ── GET /api/modules/:id/entities — 查询模组实体列表（供 @ Mention 搜索）────
/** 递归从 TipTap JSON 节点树中提取具名实体 */
function extractEntitiesFromDoc(
  node: Record<string, unknown>,
  result: Array<{ id: string; name: string; type: string; description: string }>,
): void {
  const type = node['type'] as string | undefined;
  const attrs = (node['attrs'] ?? {}) as Record<string, unknown>;
  const children = (node['content'] ?? []) as Array<Record<string, unknown>>;

  // 提取内联文本辅助函数
  const extractText = (nodes: Array<Record<string, unknown>>): string =>
    nodes
      .filter((n) => (n['type'] as string) === 'text')
      .map((n) => n['text'] as string)
      .join('');

  if (type === 'npc_mention' && attrs['name']) {
    result.push({
      id: (attrs['id'] as string) ?? '',
      name: attrs['name'] as string,
      type: 'npc',
      description: (attrs['role'] as string) ?? '',
    });
    return; // 原子节点，无子节点
  }

  if (type === 'investigable_node') {
    const name = attrs['label'] ? (attrs['label'] as string) : extractText(children);
    if (name) {
      result.push({
        id: (attrs['id'] as string) ?? '',
        name,
        type: 'investigable',
        description: '',
      });
    }
  }

  if (type === 'kp_info') {
    const name = extractText(children).slice(0, 60);
    if (name) {
      result.push({
        id: (attrs['id'] as string) ?? '',
        name,
        type: 'kp_info',
        description: '',
      });
    }
  }

  if (type === 'heading' && (attrs['level'] as number) <= 3) {
    const name = extractText(children).trim();
    if (name) {
      result.push({
        id: '',
        name,
        type: 'heading',
        description: '',
      });
    }
  }

  for (const child of children) {
    extractEntitiesFromDoc(child, result);
  }
}

router.get('/:id/entities', authMiddleware, async (req, res) => {
  const moduleId = req.params['id'];
  const mod = await db('modules')
    .where({ id: moduleId })
    .select('id', 'author_id', 'content')
    .first<{ id: string; author_id: string; content: string | null }>();
  if (!mod) { res.status(404).json({ error: 'Module not found' }); return; }
  // 仅模组作者可访问（编辑器 @ Mention 仅在编辑态使用）
  if (mod.author_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }

  const keyword = typeof req.query['keyword'] === 'string' ? req.query['keyword'].trim() : '';
  const typeFilter = typeof req.query['type'] === 'string' ? req.query['type'].trim() : '';

  let entities: Array<{ id: string; name: string; type: string; description: string }> = [];

  if (mod.content) {
    try {
      const doc = JSON.parse(mod.content) as Record<string, unknown>;
      extractEntitiesFromDoc(doc, entities);
    } catch { /* 内容解析失败，返回空列表 */ }
  }

  if (typeFilter) {
    entities = entities.filter((e) => e.type === typeFilter);
  }
  if (keyword) {
    const lc = keyword.toLowerCase();
    entities = entities.filter((e) => e.name.toLowerCase().includes(lc));
  }

  // 去重（按 name + type）并限制返回条数
  const seen = new Set<string>();
  const deduped = entities.filter((e) => {
    const key = `${e.type}::${e.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);

  res.json({ data: deduped });
});

// ── POST /api/modules/:id/entities/apply — 将 AI 分析实体写入模组内容 ─────────
const entitySchema = z.object({
  type: z.enum(['npc', 'scene', 'clue', 'item', 'event']),
  name: z.string().min(1).max(100),
  description: z.string().max(300),
  mentions: z.array(z.string()).max(10).optional().default([]),
});

const entitiesApplySchema = z.object({
  entities: z.array(entitySchema).min(1).max(100),
});

const ENTITY_TYPE_LABELS: Record<string, string> = {
  npc: 'NPC',
  scene: '场景',
  clue: '线索',
  item: '物品',
  event: '事件',
};

router.post('/:id/entities/apply', authMiddleware, requireCreator, async (req, res) => {
  const moduleId = req.params['id'];
  const mod = await db('modules').where({ id: moduleId }).first<{ author_id: string; content: string | null }>();
  if (!mod) { res.status(404).json({ error: 'Module not found' }); return; }
  if (mod.author_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }

  const parsed = entitiesApplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { entities } = parsed.data;

  // 按类型分组
  const grouped = new Map<string, typeof entities>();
  for (const e of entities) {
    if (!grouped.has(e.type)) grouped.set(e.type, []);
    grouped.get(e.type)!.push(e);
  }

  // 构建追加的 TipTap 节点
  const newNodes: unknown[] = [
    // 分隔标题
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'AI 分析结构' }],
    },
  ];

  for (const [type, items] of grouped.entries()) {
    newNodes.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: ENTITY_TYPE_LABELS[type] ?? type }],
    });
    for (const entity of items) {
      newNodes.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: entity.name }],
      });
      if (entity.description) {
        newNodes.push({
          type: 'paragraph',
          content: [{ type: 'text', text: entity.description }],
        });
      }
    }
  }

  // 合并到现有内容
  let existingDoc: { type: string; content: unknown[] } = { type: 'doc', content: [] };
  if (mod.content) {
    try {
      existingDoc = JSON.parse(mod.content) as typeof existingDoc;
    } catch { /* 使用空文档 */ }
  }

  const updatedContent = JSON.stringify({
    ...existingDoc,
    content: [...(existingDoc.content ?? []), ...newNodes],
  });

  await db('modules').where({ id: moduleId }).update({
    content: updatedContent,
    updated_at: new Date(),
  });

  res.json({ updated_content: updatedContent });
});

// ── AI 校对相关路由（版本管理 + 回滚） ──────────────────────────────────────

// GET /api/modules/:id/snapshots — 获取模组版本历史（最近3个）
router.get('/:id/snapshots', authMiddleware, async (req, res) => {
  try {
    const moduleId = req.params['id'];
    const mod = await db('modules').where({ id: moduleId }).first<{ author_id: string }>();
    if (!mod) { res.status(404).json({ error: 'Module not found' }); return; }
    if (mod.author_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const snapshots = await moduleService.getSnapshots(moduleId);
    res.json({ data: snapshots });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// POST /api/modules/:id/rollback/:snapshotId — 回滚到指定快照版本
router.post('/:id/rollback/:snapshotId', authMiddleware, async (req, res) => {
  try {
    const { id, snapshotId } = req.params;
    const success = await moduleService.rollbackToSnapshot(id!, getAuthedUser(req).id, snapshotId!);
    if (!success) {
      return res.status(404).json({ error: 'Module or snapshot not found' });
    }
    const module = await moduleService.getById(id!);
    res.json({ data: module });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Rollback failed') });
  }
});

// ── GET /api/modules/:id/search — 模组内全文搜索 ──────────────────────────
// 在模组的 TipTap JSON 内容中搜索关键词，返回匹配的文本片段（高亮位置）
const moduleSearchSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get('/:id/search', authMiddleware, async (req, res) => {
  const parsed = moduleSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const moduleId = req.params['id'];
  const mod = await db('modules')
    .where({ id: moduleId })
    .first<{ author_id: string; content: string | null }>();
  if (!mod) { res.status(404).json({ error: 'Module not found' }); return; }
  if (mod.author_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }

  const { q, limit } = parsed.data;
  const results = searchInModuleContent(mod.content, q, limit);
  res.json({ query: q, results });
});

/**
 * 在 TipTap JSON 内容中递归搜索关键词，返回带上下文的片段列表。
 * 每个匹配项包含：文本上下文（前后各 40 字）、位置信息、所在节点路径。
 */
function searchInModuleContent(
  contentJson: string | null,
  query: string,
  limit: number,
): Array<{ text: string; context: string; nodeType: string }> {
  if (!contentJson) return [];

  let docNode: unknown;
  try {
    docNode = JSON.parse(contentJson);
  } catch {
    return [];
  }

  const results: Array<{ text: string; context: string; nodeType: string }> = [];
  const lower = query.toLowerCase();
  const CONTEXT = 40;

  function walk(node: unknown, parentType = 'doc'): void {
    if (results.length >= limit) return;
    if (typeof node !== 'object' || node === null) return;

    const n = node as Record<string, unknown>;
    const type = (n['type'] as string) ?? parentType;

    if (n['text'] && typeof n['text'] === 'string') {
      const text = n['text'] as string;
      const lowerText = text.toLowerCase();
      let idx = 0;

      while (results.length < limit) {
        const pos = lowerText.indexOf(lower, idx);
        if (pos === -1) break;

        const start = Math.max(0, pos - CONTEXT);
        const end = Math.min(text.length, pos + query.length + CONTEXT);
        const context =
          (start > 0 ? '…' : '') +
          text.slice(start, end) +
          (end < text.length ? '…' : '');

        results.push({
          text: text.slice(pos, pos + query.length),
          context,
          nodeType: type,
        });

        idx = pos + 1;
      }
    }

    if (Array.isArray(n['content'])) {
      for (const child of n['content'] as unknown[]) {
        if (results.length >= limit) break;
        walk(child, type);
      }
    }
  }

  walk(docNode);
  return results;
}

export default router;

// ============================================================
// 社区版模组与衍生管理路由（§4.8）
// ============================================================

// Validation schemas
const communityUploadConfirmSchema = z.object({
  declaration: z.literal('community'),
  original_source_url: z.string().url({ message: '原发布链接格式不正确' }),
  original_source_note: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  content: z.string().min(1),
  word_count: z.number().int().nonnegative().optional(),
  ruleset_id: z.string().min(1),
  community_status: z.enum(['private_use', 'public_share']),
});

const claimLetterSchema = z.object({
  letter_type: z.enum(['public_share', 'derivative']),
  content: z.string().min(1),
  attachments: z.array(z.string().url()).max(10).optional(),
});

const claimDecisionSchema = z.object({
  decision: z.enum(['keep', 'archive']),
});

const derivativePolicySchema = z.object({
  derivative_policy: z.enum(['open', 'closed', 'review']),
});

/**
 * 粗粒度相似度检测（stub）
 * 上线后替换为调用 AI 服务的真实实现。
 * 返回 null 表示未检测到高相似度模组。
 */
async function detectSimilarModule(
  name: string,
  _content: string,
): Promise<{ module_id: string; similarity: number } | null> {
  // 暂时只做同名精确匹配；AI 语义相似度在后续迭代接入
  const row = await db('modules')
    .where({ name })
    .whereIn('source_label', ['original', 'author_version'])
    .whereNotNull('author_id')
    .select('id')
    .first();
  return row ? { module_id: row.id as string, similarity: 1.0 } : null;
}

// ── POST /api/modules/community/upload/parse ─────────────────────────────────
// 步骤1：解析上传文件，返回预览（与创作者导入共用解析器，无需创作者权限）
router.post(
  '/community/upload/parse',
  authMiddleware,
  (req, res) => {
    importUpload.single('file')(req, res, async (error) => {
      if (error) {
        res.status(400).json({ error: error.message || '文件解析失败' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: '缺少上传文件' });
        return;
      }
      try {
        const preview = await importModuleFile(
          req.file.originalname,
          req.file.mimetype,
          req.file.buffer,
        );
        res.json(preview);
      } catch (err: unknown) {
        const status = (err instanceof Error && 'status' in err && typeof (err as {status: unknown}).status === 'number')
          ? (err as {status: number}).status : 400;
        res.status(status).json({ error: safeErrorMessage(err, '文件解析失败') });
      }
    });
  },
);

// ── POST /api/modules/community/upload/confirm ───────────────────────────────
// 步骤2：用户校对完成后提交，创建社区版模组记录
router.post('/community/upload/confirm', authMiddleware, async (req, res) => {
  const parsed = communityUploadConfirmSchema.safeParse(req.body as CommunityUploadRequest);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const {
    original_source_url,
    original_source_note,
    name,
    description,
    content,
    word_count,
    ruleset_id,
    community_status,
  } = parsed.data;

  try {
    const { generateId } = await import('@trpg/shared');
    const userId = getAuthedUser(req).id;

    // 检测是否存在已入驻作者的同名/相似模组
    const similar = await detectSimilarModule(name, content);

    // 决定来源标签与可见状态
    const source_label = similar ? 'community_pending' : 'community_pending';
    // 若作者已入驻：强制进入 pending_review，不论用户选择
    const effective_community_status =
      similar && community_status === 'public_share' ? 'pending_review' : community_status;

    const id = generateId();
    await db('modules').insert({
      id,
      name,
      author_id: userId, // 技术上用上传者 ID 占位，author 为贡献者
      ruleset_id,
      description: description ?? '',
      cover_url: '',
      content,
      word_count: word_count ?? 0,
      status: effective_community_status === 'private_use' ? 'draft' : 'public',
      source_label,
      community_status: effective_community_status,
      contributor_user_id: userId,
      upstream_module_id: similar?.module_id ?? null,
      original_source_url,
      original_source_note: original_source_note ?? null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // 记录贡献者
    if (effective_community_status !== 'private_use') {
      await db('module_contributors').insert({
        id: generateId(),
        module_id: id,
        user_id: userId,
        role: 'contributor',
        created_at: new Date(),
      });
    }

    // 若作者已入驻，向作者发站内信
    if (similar && effective_community_status === 'pending_review') {
      const originalModule = await db('modules')
        .where({ id: similar.module_id })
        .select('author_id', 'name')
        .first();
      if (originalModule) {
        await notificationService.createNotification({
          userId: originalModule.author_id as string,
          type: 'module_claim_action_needed',
          title: '有社区版本等待你审核',
          content: `有用户上传了《${name}》的社区版本，请前往创作者后台审核。`,
          metadata: { module_id: id, original_module_id: similar.module_id },
        });
      }
    }

    res.status(201).json({
      id,
      source_label,
      community_status: effective_community_status,
      needs_review: effective_community_status === 'pending_review',
    });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Upload failed') });
  }
});

// ── POST /api/modules/:id/claim ──────────────────────────────────────────────
// 原作者认领一个社区版模组
router.post('/:id/claim', authMiddleware, requireCreator, async (req, res) => {
  try {
    const moduleRow = await db('modules')
      .where({ id: req.params['id']! })
      .whereIn('community_status', ['public_share', 'pending_review'])
      .first();

    if (!moduleRow) {
      return res.status(404).json({ error: '模组不存在或状态不允许认领' });
    }

    const { generateId } = await import('@trpg/shared');
    const deadlineAt = new Date(Date.now() + 168 * 60 * 60 * 1000); // 7天

    await db('modules').where({ id: req.params['id']! }).update({
      claim_deadline_at: deadlineAt,
      updated_at: new Date(),
    });

    // 通知贡献者
    const contributorUserId = moduleRow.contributor_user_id as string | null;
    if (contributorUserId) {
      await notificationService.createNotification({
        userId: contributorUserId,
        type: 'module_claimed',
        title: '你上传的模组已被原作者认领',
        content: `《${moduleRow.name}》已被原作者认领，作者将在7天内决定是否保留。`,
        metadata: {
          module_id: req.params['id']!,
          claim_deadline_at: deadlineAt.toISOString(),
        },
      });
    }

    // 同时通知作者本人需要处理
    await notificationService.createNotification({
      userId: getAuthedUser(req).id,
      type: 'module_claim_action_needed',
      title: '你已认领模组，请在7天内决定处置方式',
      content: `请在7天内对《${moduleRow.name}》的社区版本作出保留或下架的决定。`,
      metadata: {
        module_id: req.params['id']!,
        claim_deadline_at: deadlineAt.toISOString(),
      },
    });

    res.json({ success: true, claim_deadline_at: deadlineAt });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Claim failed') });
  }
});

// ── PUT /api/modules/:id/claim/decision ──────────────────────────────────────
// 原作者在7天缓冲期内决定：保留 or 下架
router.put('/:id/claim/decision', authMiddleware, requireCreator, async (req, res) => {
  const parsed = claimDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const { decision } = parsed.data;

  try {
    const moduleRow = await db('modules')
      .where({ id: req.params['id']! })
      .whereNotNull('claim_deadline_at')
      .first();

    if (!moduleRow) {
      return res.status(404).json({ error: '模组不存在或不在缓冲期内' });
    }

    const { generateId } = await import('@trpg/shared');

    if (decision === 'keep') {
      await db('modules').where({ id: req.params['id']! }).update({
        source_label: 'community_authorized',
        community_status: 'public_share',
        status: 'public',
        claim_deadline_at: null,
        updated_at: new Date(),
      });

      // 贡献者升级为荣誉协作者
      const contributorUserId = moduleRow.contributor_user_id as string | null;
      if (contributorUserId) {
        await db('module_contributors')
          .where({ module_id: req.params['id']!, user_id: contributorUserId })
          .update({ role: 'honorary_collaborator' });

        await notificationService.createNotification({
          userId: contributorUserId,
          type: 'module_claim_decision',
          title: '作者选择保留你的社区版本',
          content: `《${moduleRow.name}》已被原作者保留并授权，你已成为永久荣誉协作者。`,
          metadata: { module_id: req.params['id']!, decision: 'keep' },
        });
      }
    } else {
      // archive
      await db('modules').where({ id: req.params['id']! }).update({
        community_status: 'archived_by_author',
        status: 'archived',
        claim_deadline_at: null,
        updated_at: new Date(),
      });

      const contributorUserId = moduleRow.contributor_user_id as string | null;
      if (contributorUserId) {
        await notificationService.createNotification({
          userId: contributorUserId,
          type: 'module_claim_decision',
          title: '作者选择封存你的社区版本',
          content: `《${moduleRow.name}》已应作者要求封存，你的贡献记录保留。`,
          metadata: { module_id: req.params['id']!, decision: 'archive' },
        });
      }
    }

    res.json({ success: true, decision });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Decision failed') });
  }
});

// ── PUT /api/modules/:id/derivative-policy ───────────────────────────────────
// 原作者设置衍生管理策略（open / closed / review）
router.put('/:id/derivative-policy', authMiddleware, requireCreator, async (req, res) => {
  const parsed = derivativePolicySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const updated = await db('modules')
      .where({ id: req.params['id']!, author_id: getAuthedUser(req).id })
      .update({ derivative_policy: parsed.data.derivative_policy, updated_at: new Date() });

    if (!updated) {
      return res.status(404).json({ error: 'Not found or no permission' });
    }
    res.json({ success: true, derivative_policy: parsed.data.derivative_policy });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Update failed') });
  }
});

// ── POST /api/modules/:id/claim-letter ───────────────────────────────────────
// 贡献者提交"致作者的信"（公开分享申请 or 衍生申请）
router.post('/:id/claim-letter', authMiddleware, async (req, res) => {
  const parsed = claimLetterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const moduleRow = await db('modules').where({ id: req.params['id']! }).first();
    if (!moduleRow) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { generateId } = await import('@trpg/shared');
    const letterId = generateId();

    // 生成 AI 审核报告（stub，后续接入 ai-service）
    const aiReport = {
      similarity_score: 0,
      similar_module_id: moduleRow.upstream_module_id ?? null,
      change_summary: '（AI报告生成中）',
      compliance_flags: [],
      generated_at: new Date().toISOString(),
    };

    await db('module_claim_letters').insert({
      id: letterId,
      module_id: req.params['id']!,
      applicant_user_id: getAuthedUser(req).id,
      letter_type: parsed.data.letter_type,
      content: parsed.data.content,
      attachments: parsed.data.attachments ? JSON.stringify(parsed.data.attachments) : null,
      ai_report: JSON.stringify(aiReport),
      status: 'pending',
      created_at: new Date(),
    });

    // 通知原作者（若 upstream_module_id 存在）
    if (moduleRow.upstream_module_id) {
      const originalModule = await db('modules')
        .where({ id: moduleRow.upstream_module_id as string })
        .select('author_id', 'name')
        .first();
      if (originalModule) {
        await notificationService.createNotification({
          userId: originalModule.author_id as string,
          type: 'module_claim_letter_received',
          title: '收到一封致你的信',
          content: `有用户就《${moduleRow.name}》提交了申请，附有信件和AI审核报告。`,
          metadata: { module_id: req.params['id']!, letter_id: letterId },
        });
      }
    }

    res.status(201).json({ id: letterId, ai_report: aiReport });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Submit failed') });
  }
});

// ── PUT /api/modules/:id/claim-letter/:letterId/reply ─────────────────────────
// 原作者回复"致作者的信"并给出审批结果
router.put('/:id/claim-letter/:letterId/reply', authMiddleware, requireCreator, async (req, res) => {
  const { reply, decision } = req.body as { reply?: string; decision: 'approved' | 'rejected' };
  if (!decision || !['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be approved or rejected' });
  }
  try {
    const moduleRow = await db('modules')
      .where({ id: req.params['id']!, author_id: getAuthedUser(req).id })
      .first();
    if (!moduleRow) {
      return res.status(403).json({ error: 'No permission' });
    }

    const letter = await db('module_claim_letters')
      .where({ id: req.params['letterId']!, module_id: req.params['id']!, status: 'pending' })
      .first();
    if (!letter) {
      return res.status(404).json({ error: 'Letter not found or already processed' });
    }

    await db('module_claim_letters').where({ id: req.params['letterId']! }).update({
      status: decision,
      author_reply: reply ?? null,
      reviewed_at: new Date(),
      reviewed_by: getAuthedUser(req).id,
    });

    // 若批准，更新模组状态
    if (decision === 'approved') {
      await db('modules').where({ id: req.params['id']! }).update({
        community_status: 'public_share',
        source_label: 'community_authorized',
        status: 'public',
        updated_at: new Date(),
      });
    }

    await notificationService.createNotification({
      userId: letter.applicant_user_id as string,
      type: 'module_claim_letter_replied',
      title: decision === 'approved' ? '你的申请已通过' : '你的申请未通过',
      content: decision === 'approved'
        ? `原作者批准了你对《${moduleRow.name}》的申请。`
        : `原作者拒绝了你对《${moduleRow.name}》的申请。`,
      metadata: { module_id: req.params['id']!, letter_id: req.params['letterId']!, decision },
    });

    res.json({ success: true, decision });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Reply failed') });
  }
});

// ── GET /api/modules/:id/contributors ────────────────────────────────────────
// 获取模组贡献者列表（公开接口）
router.get('/:id/contributors', async (req, res) => {
  try {
    const rows = await db('module_contributors as mc')
      .join('users as u', 'u.id', 'mc.user_id')
      .where('mc.module_id', req.params['id']!)
      .select('mc.id', 'mc.user_id', 'mc.role', 'mc.created_at', 'u.nickname', 'u.avatar_url')
      .orderBy('mc.created_at', 'asc');
    res.json(rows);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});
