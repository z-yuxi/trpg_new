import { Router, type IRouter } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware, requireCreator } from '../middleware/auth';
import { moduleService } from '../services/module-service';
import { createModulePdfBuffer, importModuleFile } from '../services/module-transfer-service';
import { db } from '../db';
import type { CreateModuleRequest, UpdateModuleRequest, AutoSaveModuleRequest } from '@trpg/shared';

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
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
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
        .where({ id: req.params['id']!, author_id: req.user!.id })
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
    } catch (err: any) {
      const status = err?.status ?? 400;
      res.status(status).json({ error: err?.message ?? '导入失败' });
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
    const module = await moduleService.applyImportedContent(req.params['id']!, req.user!.id, parsed.data);
    if (!module) {
      res.status(404).json({ error: 'Not found or no permission' });
      return;
    }
    res.json(module);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Import confirm failed' });
  }
});

router.post('/:id/export/pdf', authMiddleware, async (req, res) => {
  try {
    const module = await moduleService.getById(req.params['id']!);
    if (!module) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (module.author_id !== req.user!.id && module.status !== 'public') {
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
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Export failed' });
  }
});

// 创建模组（需创作者权限）
router.post('/', authMiddleware, requireCreator, async (req, res) => {
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

// 更新模组（需创作者权限）
router.put('/:id', authMiddleware, requireCreator, async (req, res) => {
  try {
    const body = req.body as UpdateModuleRequest;
    const result = await moduleService.update(req.params['id']!, req.user!.id, body);
    if (!result) return res.status(404).json({ error: 'Not found or no permission' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// 自动保存端点（需创作者权限）
router.put('/:id/auto-save', authMiddleware, requireCreator, async (req, res) => {
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

// 删除模组（仅 draft 状态，需创作者权限）
router.delete('/:id', authMiddleware, requireCreator, async (req, res) => {
  try {
    const ok = await moduleService.delete(req.params['id']!, req.user!.id);
    if (!ok) return res.status(404).json({ error: 'Not found, no permission, or not in draft status' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Delete failed' });
  }
});

// 提交发布审核（需创作者权限）
router.post('/:id/submit', authMiddleware, requireCreator, async (req, res) => {
  try {
    const module = await moduleService.submitForReview(req.params['id']!, req.user!.id);
    if (!module) return res.status(404).json({ error: 'Not found or not in draft status' });
    res.json(module);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Submit failed' });
  }
});

// 撤回模组（需创作者权限）
router.post('/:id/withdraw', authMiddleware, requireCreator, async (req, res) => {
  try {
    const module = await moduleService.withdraw(req.params['id']!, req.user!.id);
    if (!module) return res.status(404).json({ error: 'Not found or invalid state' });
    res.json(module);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Withdraw failed' });
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
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// 举报模组
router.post('/:id/report', authMiddleware, async (req, res) => {
  try {
    const { report_type, description } = req.body as { report_type: string; description: string };
    if (!report_type || !description) {
      return res.status(400).json({ error: 'report_type and description are required' });
    }
    const { generateId } = await import('@trpg/shared');
    await db('module_reports').insert({
      id: generateId(),
      module_id: req.params['id']!,
      reporter_user_id: req.user!.id,
      report_type,
      description,
      status: 'pending',
      created_at: new Date(),
    });
    res.status(201).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Report failed' });
  }
});

export default router;