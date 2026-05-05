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
import { Job } from 'bullmq';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { checkAiQuota } from '../middleware/ai-quota';
import { callAI } from '../services/ai-service';
import { enqueueAiTask, getAiQueueInstance } from '../queue/ai-queue';
import { safeErrorMessage } from '../utils/error-response';
import { logError } from '../utils/structured-logger';
import { db } from '../db';
import type { TaskType } from '../services/ai-service';
import {
  extractJsonFromAiOutput,
  validateCheckTextOutput,
  validateImportModuleOutput,
  validateImportCharacterOutput,
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
    const raw = await callAI('flash', messages, 'check_text', getAuthedUser(req).id);
    const parsed = extractJsonFromAiOutput(raw);
    const result = validateCheckTextOutput(parsed, rule_terms);
    res.json(result);
  } catch (err: unknown) {
    logError('AI_CHECK_TEXT_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    const message = safeErrorMessage(err, 'AI 服务暂时不可用');
    res.status(502).json({ error: 'AI_UNAVAILABLE', message });
  }
});

// ── POST /api/ai/import-module ───────────────────────────────────────────────
const importModuleSchema = z.object({
  /** 单片模式：当前待分析的文本分片，单片限 10000 字（向后兼容） */
  text_chunk: z.string().min(1).max(10000).optional(),
  /** 全文模式：完整文档文本，最大 80000 字，服务端自动分片处理 */
  full_text: z.string().min(1).max(80000).optional(),
  /** 前一片已识别实体的精简摘要（仅名称+类型），控制在 1000 字内（单片模式可选） */
  prev_summary: z.string().max(1000).optional(),
  /** 专属术语白名单，防止 AI 改写模组固有名词 */
  term_whitelist: z.array(z.string().max(64)).max(100).optional(),
}).refine((d) => d.text_chunk || d.full_text, {
  message: 'text_chunk 或 full_text 必须提供其一',
});

/** 将长文本切分为带重叠的分片数组（全文模式使用） */
function splitIntoChunks(text: string, chunkSize = 8000, overlap = 200): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    chunks.push(text.slice(pos, pos + chunkSize));
    if (pos + chunkSize >= text.length) break;
    pos += chunkSize - overlap;
  }
  return chunks;
}

router.post('/import-module', checkAiQuota('import_module'), async (req, res) => {
  const parsed = importModuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { text_chunk, full_text, prev_summary, term_whitelist = [] } = parsed.data;

  try {
    // ── 全文分片模式 ──────────────────────────────────────────────────────
    if (full_text) {
      const chunks = splitIntoChunks(full_text);
      const taskId = await enqueueAiTask({
        userId: getAuthedUser(req).id,
        taskType: 'import_module',
        endpoint: 'pro',
        // messages 为空，Worker 使用 chunks 字段自行构建每片消息
        messages: [],
        chunks: { texts: chunks, term_whitelist },
      });
      res.status(202).json({
        task_id: taskId,
        chunk_count: chunks.length,
        message: `已分为 ${chunks.length} 片开始分析，完成后通过 Socket.IO 推送 ai_task_update 事件`,
      });
      return;
    }

    // ── 单片向后兼容模式 ─────────────────────────────────────────────────
    const safeChunk = text_chunk!;
    // MEDIUM-fix: 清洗 prev_summary 中可能的 prompt injection 内容
    const safePrevSummary = prev_summary
      ? prev_summary.replace(/\n{2,}/g, '\n').replace(/[`'"\\]/g, '').slice(0, 800)
      : undefined;

    const prevCtx = safePrevSummary ? `\n\n上一片段已识别实体摘要：${safePrevSummary}` : '';
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
      { role: 'user' as const, content: safeChunk },
    ];

    const taskId = await enqueueAiTask({
      userId: getAuthedUser(req).id,
      taskType: 'import_module',
      endpoint: 'pro',
      messages,
    });

    res.status(202).json({
      task_id: taskId,
      message: '模组分析任务已加入队列，完成后将通过 Socket.IO 推送 ai_task_update 事件',
    });
  } catch (err: unknown) {
    logError('AI_IMPORT_MODULE_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    const message = safeErrorMessage(err, '入队失败');
    res.status(503).json({ error: 'QUEUE_UNAVAILABLE', message });
  }
});

// ── POST /api/ai/import-character ───────────────────────────────────────────
const importCharacterSchema = z.object({
  /** 待解析的角色卡文本（骰子机器人指令、属性列表等），单次限 3000 字 */
  text: z.string().min(1).max(3000),
  /** 规则包 ID，可选，提供后 AI 将参考其字段命名惯例 */
  ruleset_hint: z.string().max(64).optional(),
});

router.post('/import-character', checkAiQuota('import_character'), async (req, res) => {
  const parsed = importCharacterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { text, ruleset_hint } = parsed.data;

  // 输入消毒：XML 标签边界隔离，防止 prompt injection
  const safeText = text.replace(/</g, '＜').replace(/>/g, '＞').slice(0, 3000);
  const rulesetCtx = ruleset_hint ? `\n规则包参考：${ruleset_hint.replace(/[<>"']/g, '')}` : '';

  const messages = [
    {
      role: 'system' as const,
      content:
        `你是 TRPG 角色卡识别助手。从用户提供的文本（可能是骰子机器人指令、属性列表或手写文本）` +
        `中提取角色卡字段，返回严格 JSON（无 Markdown 包裹）：` +
        `{"name":"角色名或空字符串",` +
        `"attributes":{"字段名（英文 snake_case）":数值},` +
        `"skills":{"技能名（英文 snake_case）":数值},` +
        `"resources":{"资源名":{"current":当前值,"max":最大值}},` +
        `"equipment":["道具1"],` +
        `"background":"背景故事或空字符串",` +
        `"warnings":["无法识别的字段或问题说明"]}` +
        `。属性/技能名必须使用英文 snake_case（如 strength、spot_hidden）。` +
        `无法识别的内容放入 warnings，不可捏造数值。${rulesetCtx}`,
    },
    { role: 'user' as const, content: `<character_text>\n${safeText}\n</character_text>` },
  ];

  try {
    const raw = await callAI('flash', messages, 'import_character', getAuthedUser(req).id);
    const jsonObj = extractJsonFromAiOutput(raw);
    const result = validateImportCharacterOutput(jsonObj);
    res.json(result);
  } catch (err: unknown) {
    logError('AI_IMPORT_CHARACTER_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    const message = safeErrorMessage(err, 'AI 服务暂时不可用');
    res.status(502).json({ error: 'AI_UNAVAILABLE', message });
  }
});

// ── GET /api/ai/quota ────────────────────────────────────────────────────────
router.get('/quota', authMiddleware, async (req, res) => {
  const user = getAuthedUser(req);
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
    free:    { import_module: 0,  check_text: 0,   log_summary: 0,  generate_recipe: 0,  import_character: 0  },
    pro:     { import_module: 3,  check_text: 20,  log_summary: 5,  generate_recipe: 3,  import_character: 3  },
    creator: { import_module: 10, check_text: 100, log_summary: 15, generate_recipe: 10, import_character: 10 },
  };
  const tier = (user.subscription_type as string | undefined) ?? 'free';
  const limits = MONTHLY_QUOTA[tier] ?? MONTHLY_QUOTA['free'];

  res.json({
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    used,
    limits,
  });
});

// ── GET /api/ai/tasks — 最近 AI 任务列表 ─────────────────────────────────────
router.get('/tasks', authMiddleware, async (req, res) => {
  const limit = Math.min(Number(req.query['limit'] ?? 30), 100);

  const tasks = await db('ai_usage_log')
    .where('user_id', getAuthedUser(req).id)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .select('id', 'task_type', 'status', 'input_tokens', 'output_tokens', 'duration_ms', 'created_at');

  res.json({ tasks });
});

// ── POST /api/ai/tasks/:id/retry — 失败任务重试 ──────────────────────────────
router.post('/tasks/:id/retry', authMiddleware, async (req, res) => {
  const taskId = req.params['id'];
  const user = getAuthedUser(req);

  // 确认是当前用户且任务状态为 failed
  const task = await db('ai_usage_log')
    .where({ id: taskId, user_id: user.id, status: 'failed' })
    .first();

  if (!task) {
    res.status(404).json({ error: 'NOT_FOUND', message: '未找到可重试的失败任务' });
    return;
  }

  // HIGH-fix: 重试前重新检查配额，防止通过旧失败任务绕过月度限制
  const taskType = task.task_type as TaskType;
  const MONTHLY_QUOTA: Record<string, Record<string, number>> = {
    free:    { import_module: 0,  check_text: 0,   log_summary: 0,  generate_recipe: 0,  import_character: 0  },
    pro:     { import_module: 3,  check_text: 20,  log_summary: 5,  generate_recipe: 3,  import_character: 3  },
    creator: { import_module: 10, check_text: 100, log_summary: 15, generate_recipe: 10, import_character: 10 },
  };
  const tier = (user.subscription_type as string | undefined) ?? 'free';
  const quota = (MONTHLY_QUOTA[tier] ?? MONTHLY_QUOTA['free'])[taskType] ?? 0;
  if (quota === 0) {
    res.status(403).json({ error: 'AI_FEATURE_LOCKED', message: '当前会员等级不支持此 AI 功能' });
    return;
  }
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const usedRow = await db('ai_usage_log')
    .where({ user_id: user.id, task_type: taskType, status: 'success' })
    .where('created_at', '>=', monthStart)
    .count('id as c')
    .first<{ c: number | string }>();
  if (Number(usedRow?.c ?? 0) >= quota) {
    res.status(429).json({ error: 'AI_QUOTA_EXCEEDED', message: '本月 AI 使用次数已达上限，无法重试' });
    return;
  }

  try {
    // BullMQ 按 job id 取回 job 对象并重试（将 failed → waiting）
    const queue = getAiQueueInstance();
    const job = await Job.fromId(queue, taskId);
    if (!job) {
      res.status(409).json({ error: 'JOB_EXPIRED', message: '任务已过期，无法重试，请重新发起' });
      return;
    }

    await job.retry('failed');
    await db('ai_usage_log').where({ id: taskId }).update({ status: 'queued' });

    res.json({ ok: true, task_id: taskId });
  } catch (err: unknown) {
    logError('AI_RETRY_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    const message = safeErrorMessage(err, '重试失败');
    res.status(500).json({ error: 'RETRY_FAILED', message });
  }
});

export default router;
