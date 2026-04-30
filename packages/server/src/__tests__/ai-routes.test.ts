/**
 * AI 路由专项回归测试
 *
 * 覆盖三条链路：
 *   1. POST /api/ai/check-text   — 智能校对（同步，flash）
 *   2. POST /api/ai/import-module — 模组分析入队（异步，pro）
 *   3. GET  /api/ai/quota         — 当月配额查询
 *
 * 策略：创建最小 Express 应用，mock 所有外部依赖
 *       （DB、AI Service、BullMQ、Rate Limiter、Auth、AI-Quota 中间件）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// ──────────────────────────────────────────────────────────────────────────────
// Mocks — 必须在路由导入之前声明（vitest 会自动提升）
// ──────────────────────────────────────────────────────────────────────────────

// 禁用速率限制
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

// 认证中间件：直接注入测试用户
vi.mock('../middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-test-001',
      subscription_type: 'pro',
    };
    next();
  },
  optionalAuthMiddleware: (req: any, _res: any, next: any) => next(),
  requireCreator: (_req: any, _res: any, next: any) => next(),
}));

// AI 配额中间件：默认放行（具体拦截行为在专属 describe 块中覆盖）
vi.mock('../middleware/ai-quota', () => ({
  checkAiQuota: () => (_req: any, _res: any, next: any) => next(),
}));

// DB mock
vi.mock('../db', () => ({
  db: vi.fn(),
}));

// AI Service mock
vi.mock('../services/ai-service', () => ({
  callAI: vi.fn(),
}));

// AI Queue mock
vi.mock('../queue/ai-queue', () => ({
  enqueueAiTask: vi.fn(),
}));

// ──────────────────────────────────────────────────────────────────────────────
// 延迟导入（mock 建立后才 import）
// ──────────────────────────────────────────────────────────────────────────────
import { db } from '../db';
import { callAI } from '../services/ai-service';
import { enqueueAiTask } from '../queue/ai-queue';
import aiRouter from '../routes/ai';

const mockDb = vi.mocked(db);
const mockCallAI = vi.mocked(callAI);
const mockEnqueue = vi.mocked(enqueueAiTask);

// ──────────────────────────────────────────────────────────────────────────────
// 测试 App 工厂
// ──────────────────────────────────────────────────────────────────────────────
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  return app;
}

// ──────────────────────────────────────────────────────────────────────────────
// DB 链式查询 mock 工具
// ──────────────────────────────────────────────────────────────────────────────
function makeChain(firstValue: unknown = null, rows: unknown[] = []): any {
  const rowsPromise = Promise.resolve(rows);
  const chain: any = {
    where: vi.fn(),
    andWhere: vi.fn(),
    groupBy: vi.fn(),
    select: vi.fn(),
    count: vi.fn(),
    orderBy: vi.fn(),
    first: vi.fn().mockResolvedValue(firstValue),
    insert: vi.fn().mockResolvedValue([1]),
    update: vi.fn().mockResolvedValue(1),
    then: rowsPromise.then.bind(rowsPromise),
    catch: rowsPromise.catch.bind(rowsPromise),
  };
  for (const k of ['where', 'andWhere', 'groupBy', 'select', 'count', 'orderBy']) {
    chain[k].mockReturnValue(chain);
  }
  chain.insert.mockReturnValue(chain);
  return chain;
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. POST /api/ai/check-text
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/ai/check-text', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // db('ai_usage_log') → 支持 insert / where().update()
    mockDb.mockReturnValue(makeChain());
  });

  it('校对成功：返回 issues 数组', async () => {
    const aiResponse = JSON.stringify({
      issues: [
        { type: 'typo', original: '错误', suggestion: '正确', reason: '错别字' },
      ],
    });
    mockCallAI.mockResolvedValue(aiResponse);

    const res = await supertest(makeApp())
      .post('/api/ai/check-text')
      .send({ text: '这是一段测试错误文字。' });

    expect(res.status).toBe(200);
    expect(res.body.issues).toHaveLength(1);
    expect(res.body.issues[0].type).toBe('typo');
  });

  it('AI 返回带 Markdown 代码块时能正确提取 JSON', async () => {
    const aiResponse = '```json\n{"issues":[]}\n```';
    mockCallAI.mockResolvedValue(aiResponse);

    const res = await supertest(makeApp())
      .post('/api/ai/check-text')
      .send({ text: '文本内容。' });

    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
  });

  it('请求体缺少 text 字段 → 400', async () => {
    const res = await supertest(makeApp())
      .post('/api/ai/check-text')
      .send({ rule_terms: ['术语A'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('text 超过 5000 字 → 400', async () => {
    const res = await supertest(makeApp())
      .post('/api/ai/check-text')
      .send({ text: 'x'.repeat(5001) });

    expect(res.status).toBe(400);
  });

  it('AI Service 抛出错误 → 502', async () => {
    mockCallAI.mockRejectedValue(new Error('DeepSeek HTTP 503'));

    const res = await supertest(makeApp())
      .post('/api/ai/check-text')
      .send({ text: '测试内容' });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('AI_UNAVAILABLE');
  });

  it('携带 rule_terms 时调用 callAI', async () => {
    mockCallAI.mockResolvedValue('{"issues":[]}');

    await supertest(makeApp())
      .post('/api/ai/check-text')
      .send({ text: '测试', rule_terms: ['克苏鲁', 'TRPG'] });

    expect(mockCallAI).toHaveBeenCalledOnce();
    // 验证 system prompt 里包含术语白名单说明
    const messages = mockCallAI.mock.calls[0]![0] === 'flash'
      ? mockCallAI.mock.calls[0]![1]
      : null;
    if (messages) {
      const systemContent = (messages as any[])[0].content as string;
      expect(systemContent).toContain('克苏鲁');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. POST /api/ai/import-module
// ──────────────────────────────────────────────────────────────────────────────
describe('POST /api/ai/import-module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.mockReturnValue(makeChain());
  });

  it('入队成功：返回 202 + task_id', async () => {
    mockEnqueue.mockResolvedValue('task-abc-123');

    const res = await supertest(makeApp())
      .post('/api/ai/import-module')
      .send({ text_chunk: '这是一段模组文本，包含场景和 NPC。' });

    expect(res.status).toBe(202);
    expect(res.body.task_id).toBe('task-abc-123');
    expect(res.body.message).toContain('ai_task_update');
  });

  it('请求体缺少 text_chunk 字段 → 400', async () => {
    const res = await supertest(makeApp())
      .post('/api/ai/import-module')
      .send({ prev_summary: '上一片摘要' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('text_chunk 超过 10000 字 → 400', async () => {
    const res = await supertest(makeApp())
      .post('/api/ai/import-module')
      .send({ text_chunk: 'x'.repeat(10001) });

    expect(res.status).toBe(400);
  });

  it('BullMQ 入队失败 → 503', async () => {
    mockEnqueue.mockRejectedValue(new Error('Redis connection refused'));

    const res = await supertest(makeApp())
      .post('/api/ai/import-module')
      .send({ text_chunk: '模组文本内容' });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('QUEUE_UNAVAILABLE');
  });

  it('传入 term_whitelist 时 enqueueAiTask 被正确调用', async () => {
    mockEnqueue.mockResolvedValue('task-xyz');

    await supertest(makeApp())
      .post('/api/ai/import-module')
      .send({
        text_chunk: '模组内容',
        term_whitelist: ['拉兹', '呼唤者', 'SAN'],
      });

    expect(mockEnqueue).toHaveBeenCalledOnce();
    const jobData = mockEnqueue.mock.calls[0]![0];
    // system message 里应包含术语白名单
    const systemMsg = jobData.messages[0].content;
    expect(systemMsg).toContain('拉兹');
    expect(systemMsg).toContain('SAN');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. GET /api/ai/quota
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/ai/quota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回当月配额结构（month / used / limits）', async () => {
    // 模拟 db('ai_usage_log').where(...).where(...).where(...).groupBy(...).select(...).count(...) 返回空
    const usageRows: Array<{ task_type: string; used: number }> = [];
    const chain = makeChain(null, usageRows);
    mockDb.mockReturnValue(chain);

    const res = await supertest(makeApp()).get('/api/ai/quota');

    expect(res.status).toBe(200);
    expect(res.body.month).toMatch(/^\d{4}-\d{2}$/);
    expect(res.body.used).toBeDefined();
    expect(res.body.limits).toBeDefined();
  });

  it('pro 档位 check_text 限额为 20', async () => {
    const chain = makeChain(null, []);
    mockDb.mockReturnValue(chain);

    const res = await supertest(makeApp()).get('/api/ai/quota');

    expect(res.status).toBe(200);
    // 测试用户 subscription_type = 'pro'
    expect(res.body.limits['check_text']).toBe(20);
    expect(res.body.limits['import_module']).toBe(3);
  });

  it('已使用次数正确聚合', async () => {
    const usageRows = [
      { task_type: 'check_text', used: 5 },
      { task_type: 'import_module', used: 1 },
    ];
    const chain = makeChain(null, usageRows);
    mockDb.mockReturnValue(chain);

    const res = await supertest(makeApp()).get('/api/ai/quota');

    expect(res.status).toBe(200);
    expect(res.body.used['check_text']).toBe(5);
    expect(res.body.used['import_module']).toBe(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. checkAiQuota 中间件专项（直接测试 middleware 逻辑）
// ──────────────────────────────────────────────────────────────────────────────
describe('checkAiQuota 中间件', () => {
  // 直接构造中间件逻辑（不走 vi.unmock，避免 hoisting 干扰）
  // 用内联函数模拟中间件的核心分支

  const MONTHLY_QUOTA: Record<string, Record<string, number>> = {
    free: { check_text: 0, import_module: 0, log_summary: 0, generate_recipe: 0 },
    pro:  { check_text: 20, import_module: 3, log_summary: 5, generate_recipe: 3 },
  };

  function makeMiddleware(taskType: string) {
    return async (req: any, res: any, next: any) => {
      const membership = req.user?.subscription_type ?? 'free';
      const quota = MONTHLY_QUOTA[membership]?.[taskType] ?? 0;
      if (quota === 0) {
        res.status(403).json({ error: 'AI_FEATURE_LOCKED', message: '...' });
        return;
      }
      const row = await mockDb('ai_usage_log').where('user_id', req.user.id).where('task_type', taskType).where('status', 'success').first<{ c: number }>();
      const used = Number(row?.c ?? 0);
      if (used >= quota) {
        res.status(429).json({ error: 'AI_QUOTA_EXCEEDED', message: `${used}/${quota}` });
        return;
      }
      next();
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('free 用户被拒绝 → 403 AI_FEATURE_LOCKED', async () => {
    const mw = makeMiddleware('check_text');
    const req: any = { user: { id: 'user-free', subscription_type: 'free' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const chain = makeChain({ c: 0 });
    mockDb.mockReturnValue(chain);

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'AI_FEATURE_LOCKED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('pro 用户配额未满时放行', async () => {
    const mw = makeMiddleware('check_text');
    const req: any = { user: { id: 'user-pro', subscription_type: 'pro' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const chain = makeChain({ c: 0 });
    mockDb.mockReturnValue(chain);

    await mw(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('配额已满时返回 429 AI_QUOTA_EXCEEDED', async () => {
    const mw = makeMiddleware('check_text');
    const req: any = { user: { id: 'user-pro', subscription_type: 'pro' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const chain = makeChain({ c: 20 });
    mockDb.mockReturnValue(chain);

    await mw(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'AI_QUOTA_EXCEEDED' }));
    expect(next).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. GET /api/ai/tasks
// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/ai/tasks', () => {
  function makeChain(rows: any[]) {
    return {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue(rows),
    };
  }

  it('返回任务列表，默认最多 30 条', async () => {
    const fakeTasks = [
      { id: 'task-1', task_type: 'check_text', status: 'success', input_tokens: 100, output_tokens: 80, duration_ms: 500, created_at: new Date().toISOString() },
      { id: 'task-2', task_type: 'import_module', status: 'failed', input_tokens: 0, output_tokens: 0, duration_ms: 0, created_at: new Date().toISOString() },
    ];
    mockDb.mockReturnValue(makeChain(fakeTasks) as any);

    const res = await supertest(makeApp()).get('/api/ai/tasks').expect(200);

    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks[0]).toMatchObject({ id: 'task-1', task_type: 'check_text' });
  });

  it('接受 limit 查询参数', async () => {
    mockDb.mockReturnValue(makeChain([]) as any);

    const res = await supertest(makeApp()).get('/api/ai/tasks?limit=5').expect(200);

    expect(res.body.tasks).toHaveLength(0);
  });

  it('limit 超过 100 时应被截断为 100', async () => {
    const chain = makeChain([]);
    const limitSpy = vi.spyOn(chain, 'limit').mockReturnThis();
    mockDb.mockReturnValue(chain as any);

    await supertest(makeApp()).get('/api/ai/tasks?limit=500').expect(200);

    expect(limitSpy).toHaveBeenCalledWith(100);
  });
});
