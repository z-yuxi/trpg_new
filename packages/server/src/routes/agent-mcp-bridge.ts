import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { generateId } from '@trpg/shared';
import { authMiddleware } from '../middleware/auth';
import { forumService } from '../services/forum-service';
import { db } from '../db';
import { safeErrorMessage } from '../utils/error-response';
import { safeJsonParse } from '../utils/safe-json';

const router: IRouter = Router();

function ensureAdmin(req: any, res: any): boolean {
  const userType = req.user?.user_type;
  const isAdmin = Array.isArray(userType) && userType.includes('admin');
  if (!isAdmin) {
    res.status(403).json({ error: 'FORBIDDEN', message: '权限不足' });
    return false;
  }
  return true;
}

const faqItems = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    category: 'basic',
    question: '如何开始跑团？',
    answer: '先在发现页选择招募帖，申请后等待 GM 审核，通过后可进入房间。',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    category: 'account',
    question: '账号被封禁怎么办？',
    answer: '请通过工单系统提交申诉，客服会在 1-3 个工作日内处理。',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    category: 'dispute',
    question: '如何举报违规内容？',
    answer: '在内容页面点击举报，填写原因并提交，管理员会进行审核。',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    category: 'features',
    question: 'AI 功能有哪些限制？',
    answer: '不同会员等级有不同 AI 配额，可在 AI 配额页面查看当月使用情况。',
  },
] as const;

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return 0;
}

function toIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return null;
}

// POST /api/posts
router.post('/posts', authMiddleware, async (req, res) => {
  const schema = z.object({
    board: z.enum(['tips', 'share', 'lounge']),
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(10000),
    idempotent_key: z.string().uuid().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  try {
    const created = await forumService.createThread({
      board: parsed.data.board,
      author_id: req.user!.id,
      title: parsed.data.title,
      content: parsed.data.content,
    });

    res.status(201).json({
      thread_id: created.id,
      author_id: created.author_id,
      title: created.title,
      created_at: toIso(created.created_at),
    });
  } catch (err: unknown) {
    const message = safeErrorMessage(err, '创建帖子失败');
    res.status(400).json({ error: 'INVALID_PARAM', message });
  }
});

// POST /api/comments
router.post('/comments', authMiddleware, async (req, res) => {
  const schema = z.object({
    thread_id: z.string().min(1),
    content: z.string().min(1).max(10000),
    reply_to_post_id: z.string().min(1).optional(),
    idempotent_key: z.string().uuid().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  try {
    const post = await forumService.createPost({
      thread_id: parsed.data.thread_id,
      author_id: req.user!.id,
      content: parsed.data.content,
      reply_to_post_id: parsed.data.reply_to_post_id,
    });

    res.status(201).json({
      post_id: post.id,
      thread_id: post.thread_id,
      floor_number: post.floor_number,
      author_id: post.author_id,
      created_at: toIso(post.created_at),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('NOT_FOUND') || msg.includes('not found')) {
      res.status(404).json({ error: 'NOT_FOUND', message: '目标帖子不存在' });
      return;
    }
    const message = safeErrorMessage(err, '评论失败');
    res.status(400).json({ error: 'INVALID_PARAM', message });
  }
});

// POST /api/help/chat
router.post('/help/chat', authMiddleware, async (req, res) => {
  const schema = z.object({
    message: z.string().min(1).max(4000),
    session_id: z.string().uuid().optional(),
    context: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const q = parsed.data.message.toLowerCase();
  const matches = faqItems.filter((f) => {
    const hay = `${f.question} ${f.answer}`.toLowerCase();
    return q.split(/\s+/).some((w) => w.length > 1 && hay.includes(w));
  });

  const needsHumanReview = /封禁|申诉|投诉|侵权|律师|人工|人工客服/.test(parsed.data.message);
  const answer = matches.length > 0
    ? matches[0].answer
    : '我已收到你的问题。若涉及账号申诉、举报争议或版权纠纷，建议提交工单由人工处理。';

  res.json({
    answer,
    faq_references: matches.slice(0, 3).map((f) => ({ faq_id: f.id, question: f.question })),
    needs_human_review: needsHumanReview,
  });
});

// GET /api/help/faq
router.get('/help/faq', authMiddleware, async (req, res) => {
  const schema = z.object({
    query: z.string().min(1).max(256),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const limit = parsed.data.limit ?? 10;
  const q = parsed.data.query.toLowerCase();
  const scored = faqItems.map((f) => {
    const hay = `${f.question} ${f.answer}`.toLowerCase();
    const hit = q.split(/\s+/).filter((w) => w.length > 1 && hay.includes(w)).length;
    return { ...f, score: hit };
  });
  const items = scored
    .filter((i) => i.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ id, category, question, answer, score }) => ({
      id,
      category,
      question,
      answer,
      relevance_score: score,
    }));

  res.json({ query: parsed.data.query, total: items.length, items });
});

// GET /api/admin/reports/:id
router.get('/admin/reports/:id', authMiddleware, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  try {
    const row = await db('content_reports').where({ id: req.params['id']! }).first();
    if (!row) {
      res.status(404).json({ error: 'NOT_FOUND', message: '举报不存在' });
      return;
    }

    const contentTypeRaw = String(row.content_type ?? 'post');
    const contentType = contentTypeRaw === 'message' ? 'comment' : contentTypeRaw;

    res.json({
      id: String(row.id),
      status: String(row.status),
      content_type: contentType,
      content_id: String(row.content_id),
      reporter_user_id: String(row.reporter_user_id),
      reason: String(row.reason ?? ''),
      // TODO(#backlog): content_snapshot 字段待由 code owner 补充快照序列化逻辑
      content_snapshot: safeJsonParse(row.content_snapshot, null),
      created_at: toIso(row.created_at),
      resolved_at: toIso(row.resolved_at),
      resolution_note: row.resolution_note ? String(row.resolution_note) : null,      // 动态拼接最新 AI 建议（取最近一条，不持久化为独立字段）
      ai_suggestion: await db('ai_suggestion_log')
        .where({ report_id: req.params['id']! })
        .orderBy('created_at', 'desc')
        .select('agent_id', 'action', 'confidence', 'evidence', 'rule', 'decision_trace', 'created_at')
        .first()
        .then((r: any) => r ?? null),    });
  } catch (err: unknown) {
    const message = safeErrorMessage(err, '查询举报失败');
    res.status(500).json({ error: 'INTERNAL_ERROR', message });
  }
});

// POST /api/agent/review-suggestion
router.post('/agent/review-suggestion', authMiddleware, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const schema = z.object({
    report_id: z.string().min(1),
    action: z.enum(['retain', 'delete', 'restrict', 'suspend']),
    confidence: z.number().int().min(0).max(100),
    reasoning: z.string().max(2000).optional(),
    applicable_clauses: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const exists = await db('content_reports').where({ id: parsed.data.report_id }).first();
  if (!exists) {
    res.status(404).json({ error: 'NOT_FOUND', message: '举报不存在' });
    return;
  }

  const taskId = generateId();
  res.json({
    status: 'accepted',
    task_id: taskId,
  });
});

// GET /api/admin/stats/trends
router.get('/admin/stats/trends', authMiddleware, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const schema = z.object({
    days: z.coerce.number().int().min(1).max(90).optional(),
  });
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const days = parsed.data.days ?? 7;
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() - days);
  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - days);

  try {
    const [currentReportsRaw, previousReportsRaw, currentThreadsRaw, previousThreadsRaw] = await Promise.all([
      db('content_reports').where('created_at', '>=', currentStart).count('id as c').first(),
      db('content_reports').where('created_at', '>=', previousStart).andWhere('created_at', '<', currentStart).count('id as c').first(),
      db('forum_threads').where('created_at', '>=', currentStart).count('id as c').first(),
      db('forum_threads').where('created_at', '>=', previousStart).andWhere('created_at', '<', currentStart).count('id as c').first(),
    ]);

    const currentReports = toNumber(currentReportsRaw?.c);
    const previousReports = toNumber(previousReportsRaw?.c);
    const currentThreads = toNumber(currentThreadsRaw?.c);
    const previousThreads = toNumber(previousThreadsRaw?.c);
    const reportDelta = previousReports === 0 ? 100 : ((currentReports - previousReports) / previousReports) * 100;

    const alerts = [] as Array<{ level: 'info' | 'warning' | 'critical'; message: string; metric: string }>;
    if (reportDelta >= 50) {
      alerts.push({ level: 'warning', message: '举报量较上一周期显著上升', metric: 'report_count_change' });
    }
    if (currentThreads < previousThreads * 0.5 && previousThreads > 0) {
      alerts.push({ level: 'info', message: '社区发帖活跃度下降', metric: 'thread_count_change' });
    }

    res.json({
      timestamp: now.toISOString(),
      period: {
        days,
        start_date: currentStart.toISOString().slice(0, 10),
        end_date: now.toISOString().slice(0, 10),
      },
      summary: {
        report_count_change: {
          current_period: currentReports,
          previous_period: previousReports,
          percent_change: Number(reportDelta.toFixed(2)),
        },
        content_growth: {
          thread_current: currentThreads,
          thread_previous: previousThreads,
        },
      },
      alerts,
    });
  } catch (err: unknown) {
    const message = safeErrorMessage(err, '趋势统计失败');
    res.status(500).json({ error: 'INTERNAL_ERROR', message });
  }
});

// POST /api/agent/daily-report
router.post('/agent/daily-report', authMiddleware, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().optional(),
    include_metrics: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  try {
    const taskId = generateId();
    res.json({
      task_id: taskId,
      status: 'completed',
      report_date: parsed.data.date,
      report_url: null,
      estimated_completion: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = safeErrorMessage(err, '日报生成失败');
    res.status(500).json({ error: 'INTERNAL_ERROR', message });
  }
});

// POST /api/agent/legal-search
router.post('/agent/legal-search', authMiddleware, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const schema = z.object({
    query: z.string().min(1).max(2000),
    jurisdiction: z.enum(['CN', 'US', 'EU']).optional(),
    case_type: z.enum(['copyright', 'tos_violation', 'user_dispute', 'platform_compliance']).optional(),
    related_content_id: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const jurisdiction = parsed.data.jurisdiction ?? 'CN';
  const library = [
    {
      id: 'cn_copyright_1',
      title: '中华人民共和国著作权法（摘要）',
      law_text: '未经许可复制、传播受著作权法保护的作品，可能构成侵权。',
      jurisdiction: 'CN',
      category: 'law',
    },
    {
      id: 'platform_tos_1',
      title: '平台用户公约（内容发布）',
      law_text: '禁止发布侵权、侮辱、仇恨或违法内容。',
      jurisdiction: 'CN',
      category: 'agreement',
    },
  ];

  const q = parsed.data.query.toLowerCase();
  const results = library
    .filter((item) => item.jurisdiction === jurisdiction)
    .filter((item) => `${item.title} ${item.law_text}`.toLowerCase().includes(q) || q.length <= 2)
    .map((item) => ({ ...item }));

  res.json({
    query_matched: parsed.data.query,
    results,
  });
});

// POST /api/agent/evidence-analysis
router.post('/agent/evidence-analysis', authMiddleware, async (req, res) => {
  if (!ensureAdmin(req, res)) return;

  const schema = z.object({
    evidence: z.object({
      type: z.enum(['text', 'image', 'timestamp', 'user_profile']),
      content: z.string().min(1),
      metadata: z.record(z.unknown()).optional(),
    }),
    scenario: z.enum(['copyright_infringement', 'tos_violation', 'user_dispute', 'fraud']),
    context: z.record(z.unknown()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const lower = parsed.data.evidence.content.toLowerCase();
  const riskLevel = /侵权|盗版|诈骗|伪造/.test(lower)
    ? 'high'
    : /争议|投诉|违规/.test(lower)
      ? 'medium'
      : 'low';

  res.json({
    assessment: {
      risk_level: riskLevel,
      confidence: riskLevel === 'high' ? 85 : 70,
      legal_opinion: '该结果为自动分析，仅供管理员初筛，正式结论需人工复核。',
      recommended_action: riskLevel === 'high' ? 'escalate_to_lawyer' : 'contact_user',
      details: {
        scenario: parsed.data.scenario,
        evidence_type: parsed.data.evidence.type,
      },
    },
  });
});

/**
 * POST /api/agent/preferences
 *
 * 用户对 AI 社交引荐的偏好操作：
 *   action="dismiss"  → 永久拒绝该匹配对（rejected_match_pair_id）
 *   action="snooze"   → 30 天内不推荐（snooze_until）
 *
 * 需要登录（JWT），操作的是当前登录用户自己的偏好。
 */
router.post('/agent/preferences', authMiddleware, async (req, res) => {
  const schema = z.object({
    action: z.enum(['dismiss', 'snooze']),
    match_pair_id: z.string().min(1).max(128).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_PARAM', message: '参数不合法', details: parsed.error.flatten() });
    return;
  }

  const userId = req.user!.id;
  const { action, match_pair_id } = parsed.data;

  if (action === 'dismiss' && !match_pair_id) {
    res.status(400).json({ error: 'INVALID_PARAM', message: 'dismiss 操作需要提供 match_pair_id' });
    return;
  }

  const id = generateId();
  const snoozeUntil = action === 'snooze'
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;

  await db('user_agent_preferences').insert({
    id,
    user_id: userId,
    rejected_match_pair_id: action === 'dismiss' ? match_pair_id! : null,
    snooze_until: snoozeUntil,
  });

  res.status(201).json({ id, action, status: 'recorded' });
});

export default router;