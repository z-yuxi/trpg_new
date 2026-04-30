/**
 * AI 功能路由 /api/ai
 *
 * POST /api/ai/check-text       — 智能校对（同步，flash，≤20次/月专业版）
 * POST /api/ai/import-module    — 模组结构分析（异步入队，pro，≤3次/月专业版）
 * GET  /api/ai/quota            — 查询当月配额使用情况
 *
 * 所有端点须登录；所有端点共享 60次/min IP 速率限制。
 */
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';
import { checkAiQuota } from '../middleware/ai-quota';
import { callAI } from '../services/ai-service';
import { enqueueAiTask } from '../queue/ai-queue';
import { safeErrorMessage } from '../utils/error-response';
import { db } from '../db';
import type { TaskType } from '../services/ai-service';
import {
  extractJsonFromAiOutput,
  validateCheckTextOutput,
  validateImportModuleOutput,
} from '../services/ai-output-validator';

const router: IRouter = Router();

// ── 速率限制：防止爆发性消耗 ─────────────────────────────────────────────────
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI_RATE_LIMITED', message: '请求过于频繁，请稍后重试' },
});

router.use(authMiddleware, aiRateLimiter);

// ── POST /api/ai/check-text ─────────────────────────────────────────────────
const checkTextSchema = z.object({
  /** 待校对文本，单次限 5000 字 */
  text: z.string().min(1).max(5000),
  /** 自定义术语白名单，不将其标记为错误 */
  rule_terms: z.array(z.string().max(64)).max(50).optional(),
});

router.post('/check-text', checkAiQuota('check_text'), async (req, res) => {
  const parsed = checkTextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { text, rule_terms = [] } = parsed.data;
  const termsCtx = rule_terms.length
    ? `\n\n用户术语白名单（不可标记为错误）：${rule_terms.join('、')}`
    : '';

  const messages = [
    {
      role: 'system' as const,
      content:
        `你是专业的 TRPG 模组文本校对助手。检查给定文本中的错别字、标点不规范、用词不统一问题。` +
        `返回严格 JSON（无 Markdown 包裹）：` +
        `{"issues":[{"type":"typo"|"punctuation"|"term"|"style","original":"原文片段","suggestion":"建议修改","reason":"说明"}]}` +
        `。禁止修改骰子表达式（1d100、1D20 等）和专业缩写（SAN、DC、HP、PC、NPC 等）。${termsCtx}`,
    },
    { role: 'user' as const, content: text },
  ];

  try {
    const raw = await callAI('flash', messages, 'check_text', req.user!.id);
    const parsed = extractJsonFromAiOutput(raw);
    const result = validateCheckTextOutput(parsed, rule_terms);
    res.json(result);
  } catch (err: unknown) {
    console.error('[ai:checkText]', err instanceof Error ? err.message : err);
    const message = safeErrorMessage(err, 'AI 服务暂时不可用');
    res.status(502).json({ error: 'AI_UNAVAILABLE', message });
  }
});

// ── POST /api/ai/import-module ───────────────────────────────────────────────
const importModuleSchema = z.object({
  /** 当前待分析的文本分片，单片限 10000 字 */
  text_chunk: z.string().min(1).max(10000),
  /** 前一片已识别实体的精简摘要（仅名称+类型），控制在 1000 字内 */
  prev_summary: z.string().max(1000).optional(),
  /** 专属术语白名单，防止 AI 改写模组固有名词 */
  term_whitelist: z.array(z.string().max(64)).max(100).optional(),
});

router.post('/import-module', checkAiQuota('import_module'), async (req, res) => {
  const parsed = importModuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { text_chunk, prev_summary, term_whitelist = [] } = parsed.data;
  const prevCtx = prev_summary ? `\n\n上一片段已识别实体摘要：${prev_summary}` : '';
  const termsCtx = term_whitelist.length
    ? `\n\n专属术语（保留原文，不可改写）：${term_whitelist.join('、')}`
    : '';

  const messages = [
    {
      role: 'system' as const,
      content:
        `你是 TRPG 模组结构分析助手。从文本片段中提取结构化实体。` +
        `返回严格 JSON（无 Markdown 包裹）：` +
        `{"entities":[{"type":"npc"|"scene"|"clue"|"item"|"event","name":"名称","description":"简短描述（50字内）","mentions":["相关文本引用"]}]}` +
        `。${prevCtx}${termsCtx}`,
    },
    { role: 'user' as const, content: text_chunk },
  ];

  try {
    const taskId = await enqueueAiTask({
      userId: req.user!.id,
      taskType: 'import_module',
      endpoint: 'pro',
      messages,
    });

    res.status(202).json({
      task_id: taskId,
      message: '模组分析任务已加入队列，完成后将通过 Socket.IO 推送 ai_task_update 事件',
    });
  } catch (err: unknown) {
    console.error('[ai:importModule]', err instanceof Error ? err.message : err);
    const message = safeErrorMessage(err, '入队失败');
    res.status(503).json({ error: 'QUEUE_UNAVAILABLE', message });
  }
});

// ── GET /api/ai/quota ────────────────────────────────────────────────────────
router.get('/quota', async (req, res) => {
  const user = req.user!;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = (await db('ai_usage_log')
    .where('user_id', user.id)
    .where('status', 'success')
    .where('created_at', '>=', monthStart)
    .groupBy('task_type')
    .select('task_type')
    .count('id as used')) as Array<{ task_type: TaskType; used: number | string }>;

  const used: Partial<Record<TaskType, number>> = {};
  for (const r of rows) {
    used[r.task_type] = Number(r.used);
  }

  // 返回当前会员等级对应的月度配额上限
  const MONTHLY_QUOTA: Record<string, Record<string, number>> = {
    free:    { import_module: 0,  check_text: 0,   log_summary: 0,  generate_recipe: 0  },
    pro:     { import_module: 3,  check_text: 20,  log_summary: 5,  generate_recipe: 3  },
    creator: { import_module: 10, check_text: 100, log_summary: 15, generate_recipe: 10 },
  };
  const tier = (user.subscription_type as string | undefined) ?? 'free';
  const limits = MONTHLY_QUOTA[tier] ?? MONTHLY_QUOTA['free'];

  res.json({
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    used,
    limits,
  });
});

export default router;
