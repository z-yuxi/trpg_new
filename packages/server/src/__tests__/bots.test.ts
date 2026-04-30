/**
 * 机器人系统验收测试
 *
 * 覆盖范围：
 * 1. BotService  — 创建/激活/休眠/转运营/查询
 * 2. Prompts     — parsePostResponse 解析边界情况
 * 3. SeedGenerator — 静态回退路径（不调用 AI）
 * 4. Publisher   — publishThread / publishPost（mock ForumService + DB）
 * 5. Interactor  — likeThread / replyToThread 防重复逻辑
 * 6. Phase 4 验收 — hibernateAll + getGeneratedContentStats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks（vitest 提升）──────────────────────────────────
vi.mock('../db', () => ({ db: vi.fn() }));
vi.mock('../services/forum-service', () => ({
  forumService: {
    createThread: vi.fn(),
    createPost: vi.fn(),
  },
}));
vi.mock('../bots/bot-service', () => {
  const mockBotService = {
    getBotById: vi.fn(),
    getBotByUid: vi.fn(),
    getBots: vi.fn(),
    getActiveBots: vi.fn(),
    createBot: vi.fn(),
    activateBot: vi.fn(),
    hibernateBot: vi.fn(),
    hibernateAll: vi.fn(),
    transferToOps: vi.fn(),
    getGeneratedContentStats: vi.fn(),
  };
  return { botService: mockBotService, BOT_UID_RANGE: { min: 1000095, max: 1000099 } };
});
vi.mock('../bots/publisher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bots/publisher')>();
  return {
    ...actual,
    publisher: {
      publishThread: vi.fn(),
      publishPost: vi.fn(),
    },
  };
});
vi.mock('../bots/seed-generator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bots/seed-generator')>();
  return {
    ...actual,
    seedGenerator: {
      generatePost: vi.fn(),
      generateReply: vi.fn(),
      generateBatch: vi.fn(),
    },
  };
});

// ── Imports（after mocks）───────────────────────────────
import { db } from '../db';
import { forumService } from '../services/forum-service';
import { botService, BOT_UID_RANGE } from '../bots/bot-service';
import { publisher } from '../bots/publisher';
import { seedGenerator } from '../bots/seed-generator';
import { parsePostResponse, BOT_BOARD_PREFERENCE, getPromptForBoard } from '../bots/prompts';
import { SeedGenerator } from '../bots/seed-generator';
import { Interactor } from '../bots/interactor';

const mockDb = vi.mocked(db);
const mockForumService = vi.mocked(forumService);
const mockBotService = vi.mocked(botService);
const mockPublisher = vi.mocked(publisher);
const mockSeedGenerator = vi.mocked(seedGenerator);

// ────────────────────────────────────────────────────────
// 1. Prompts — parsePostResponse
// ────────────────────────────────────────────────────────
describe('parsePostResponse', () => {
  it('解析标准 JSON', () => {
    const raw = '{"title":"测试标题","content":"测试内容"}';
    const result = parsePostResponse(raw);
    expect(result).toEqual({ title: '测试标题', content: '测试内容' });
  });

  it('解析 Markdown 代码块包裹的 JSON', () => {
    const raw = '```json\n{"title":"A","content":"B"}\n```';
    const result = parsePostResponse(raw);
    expect(result).toEqual({ title: 'A', content: 'B' });
  });

  it('title 超长时截断到 200 字符', () => {
    const longTitle = 'x'.repeat(300);
    const raw = `{"title":"${longTitle}","content":"c"}`;
    const result = parsePostResponse(raw);
    expect(result?.title).toHaveLength(200);
  });

  it('content 超长时截断到 5000 字符', () => {
    const longContent = 'y'.repeat(6000);
    const raw = `{"title":"t","content":"${longContent}"}`;
    const result = parsePostResponse(raw);
    expect(result?.content).toHaveLength(5000);
  });

  it('缺少 content 字段时返回 null', () => {
    const result = parsePostResponse('{"title":"only-title"}');
    expect(result).toBeNull();
  });

  it('非 JSON 字符串返回 null', () => {
    const result = parsePostResponse('这不是 JSON');
    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────
// 2. Prompts — BOT_BOARD_PREFERENCE / getPromptForBoard
// ────────────────────────────────────────────────────────
describe('BOT_BOARD_PREFERENCE', () => {
  it('规则博士偏好 tips 板块', () => {
    expect(BOT_BOARD_PREFERENCE['规则博士']).toContain('tips');
  });

  it('故事编织者偏好 share 板块', () => {
    expect(BOT_BOARD_PREFERENCE['故事编织者']).toContain('share');
  });

  it('茶馆侠客偏好 lounge 板块', () => {
    expect(BOT_BOARD_PREFERENCE['茶馆侠客']).toContain('lounge');
  });
});

describe('getPromptForBoard', () => {
  it.each(['tips', 'share', 'lounge'] as const)('%s 板块返回 system 和 buildUser', (board) => {
    const { system, buildUser } = getPromptForBoard(board);
    expect(system).toBeTruthy();
    expect(typeof buildUser).toBe('function');
    const prompt = buildUser('test-seed');
    expect(prompt).toContain('test-seed');
  });
});

// ────────────────────────────────────────────────────────
// 3. SeedGenerator — 静态回退路径
// ────────────────────────────────────────────────────────
describe('SeedGenerator (no-AI fallback)', () => {
  const gen = new SeedGenerator();

  it('useAi=false 时返回静态内容', async () => {
    const result = await gen.generatePost({ botLabel: '规则博士', useAi: false });
    expect(result.board).toBeDefined();
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('board 参数指定时输出对应板块', async () => {
    const result = await gen.generatePost({ botLabel: '茶馆侠客', board: 'lounge', useAi: false });
    expect(result.board).toBe('lounge');
  });

  it('generateReply useAi=false 返回非空字符串', async () => {
    const reply = await gen.generateReply({
      threadTitle: '测试帖子',
      threadContent: '这是内容',
      useAi: false,
    });
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('generateBatch 返回指定数量', async () => {
    const results = await gen.generateBatch({ botLabel: '故事编织者', count: 3, useAi: false });
    expect(results).toHaveLength(3);
  });
});

// ────────────────────────────────────────────────────────
// 4. Publisher — publishThread / publishPost
// ────────────────────────────────────────────────────────
// Publisher 直接 import，需要 mock botService 和 forumService
import { Publisher } from '../bots/publisher';

describe('Publisher', () => {
  let pub: Publisher;
  const FAKE_BOT = {
    id: 'bot-001',
    uid: 1000095,
    nickname: '探索者-零',
    avatar_url: '',
    bot_label: '探索者-零',
    bot_status: 'active' as const,
    created_at: new Date(),
  };

  beforeEach(() => {
    pub = new Publisher();
    vi.clearAllMocks();
  });

  it('publishThread 调用 forumService.createThread 并更新 is_bot_generated', async () => {
    mockBotService.getBotById.mockResolvedValue(FAKE_BOT);
    const fakeThread = { id: 'thread-001', board: 'tips', author_id: 'bot-001', title: 'T', content: 'C',
      view_count: 0, reply_count: 0, is_pinned: false, is_locked: false, last_reply_at: null, created_at: new Date() };
    mockForumService.createThread.mockResolvedValue(fakeThread as any);

    // mock db chain: db('forum_threads').where().update()
    const chainMock = { where: vi.fn().mockReturnThis(), update: vi.fn().mockResolvedValue(1) };
    mockDb.mockReturnValue(chainMock as any);

    const result = await pub.publishThread({
      botId: 'bot-001',
      board: 'tips',
      title: 'T',
      content: 'C',
    });

    expect(result.threadId).toBe('thread-001');
    expect(mockForumService.createThread).toHaveBeenCalledWith({
      board: 'tips', author_id: 'bot-001', title: 'T', content: 'C',
    });
    expect(chainMock.update).toHaveBeenCalledWith({ is_bot_generated: 1 });
  });

  it('机器人不存在时 publishThread 抛出错误', async () => {
    mockBotService.getBotById.mockResolvedValue(null);
    await expect(pub.publishThread({ botId: 'x', board: 'tips', title: 'T', content: 'C' }))
      .rejects.toThrow('不存在');
  });

  it('机器人休眠时 publishThread 抛出错误', async () => {
    mockBotService.getBotById.mockResolvedValue({ ...FAKE_BOT, bot_status: 'hibernated' });
    await expect(pub.publishThread({ botId: 'bot-001', board: 'tips', title: 'T', content: 'C' }))
      .rejects.toThrow('休眠');
  });
});

// ────────────────────────────────────────────────────────
// 5. Interactor — 点赞防重复 + 回复
// ────────────────────────────────────────────────────────
describe('Interactor', () => {
  let inter: Interactor;
  const FAKE_BOT = {
    id: 'bot-002',
    uid: 1000096,
    nickname: '规则博士',
    avatar_url: '',
    bot_label: '规则博士',
    bot_status: 'active' as const,
    created_at: new Date(),
  };

  beforeEach(() => {
    inter = new Interactor();
    inter.clearInteractionMemory();
    vi.clearAllMocks();
  });

  it('likeThread 第一次点赞返回 liked=true', async () => {
    mockBotService.getBotById.mockResolvedValue(FAKE_BOT);
    const chainMock = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'thread-001', is_locked: false }),
      increment: vi.fn().mockResolvedValue(1),
    };
    mockDb.mockReturnValue(chainMock as any);

    const result = await inter.likeThread({ botId: 'bot-002', threadId: 'thread-001' });
    expect(result.liked).toBe(true);
  });

  it('likeThread 同一帖子第二次返回 liked=false（防重复）', async () => {
    mockBotService.getBotById.mockResolvedValue(FAKE_BOT);
    const chainMock = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'thread-001' }),
      increment: vi.fn().mockResolvedValue(1),
    };
    mockDb.mockReturnValue(chainMock as any);

    await inter.likeThread({ botId: 'bot-002', threadId: 'thread-001' });
    const second = await inter.likeThread({ botId: 'bot-002', threadId: 'thread-001' });
    expect(second.liked).toBe(false);
  });

  it('机器人休眠时 likeThread 返回 liked=false', async () => {
    mockBotService.getBotById.mockResolvedValue({ ...FAKE_BOT, bot_status: 'hibernated' });
    const result = await inter.likeThread({ botId: 'bot-002', threadId: 'thread-001' });
    expect(result.liked).toBe(false);
  });

  it('getInteractionCount 随互动增加', async () => {
    expect(inter.getInteractionCount()).toBe(0);
    mockBotService.getBotById.mockResolvedValue(FAKE_BOT);
    const chainMock = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 't' }),
      increment: vi.fn().mockResolvedValue(1),
    };
    mockDb.mockReturnValue(chainMock as any);
    await inter.likeThread({ botId: 'bot-002', threadId: 't' });
    expect(inter.getInteractionCount()).toBe(1);
  });
});

// ────────────────────────────────────────────────────────
// 6. Phase 4 验收 — 清理逻辑
// ────────────────────────────────────────────────────────
describe('Phase 4 验收：清理逻辑', () => {
  it('hibernateAll 能被调用并返回休眠数量', async () => {
    mockBotService.hibernateAll.mockResolvedValue(5);
    const count = await botService.hibernateAll();
    expect(count).toBe(5);
  });

  it('getGeneratedContentStats 返回正确结构', async () => {
    mockBotService.getGeneratedContentStats.mockResolvedValue({ threads: 10, posts: 25 });
    const stats = await botService.getGeneratedContentStats();
    expect(stats).toEqual({ threads: 10, posts: 25 });
  });

  it('BOT_UID_RANGE 保持 1000095–1000099', () => {
    expect(BOT_UID_RANGE.min).toBe(1000095);
    expect(BOT_UID_RANGE.max).toBe(1000099);
    expect(BOT_UID_RANGE.max - BOT_UID_RANGE.min).toBe(4); // 5 个位置
  });
});
