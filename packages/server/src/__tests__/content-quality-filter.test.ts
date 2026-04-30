/**
 * 内容质量过滤器验收测试
 *
 * 覆盖：
 * 1. 敏感词检测 — 命中 / 未命中
 * 2. 过短文本检测 — 等于/小于/大于阈值
 * 3. 重复率检测 — Jaccard 相似度高/低
 * 4. 组合路径 — 全部通过
 * 5. 常量导出 — MIN_CONTENT_CHARS / MAX_REPEAT_RATIO
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock('../db', () => ({ db: vi.fn() }));

import { db } from '../db';
import { ContentQualityFilter, MIN_CONTENT_CHARS, MAX_REPEAT_RATIO } from '../bots/content-quality-filter';

const mockDb = vi.mocked(db);

function makeDbChain(rows: Array<{ content: string }>) {
  return {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(rows),
  };
}

describe('ContentQualityFilter', () => {
  let filter: ContentQualityFilter;

  beforeEach(() => {
    filter = new ContentQualityFilter();
    vi.clearAllMocks();
  });

  // ── 敏感词 ──────────────────────────────────────────────────────────────
  describe('敏感词检测', () => {
    it('正文含敏感词时 passed=false, reason=sensitive_word', async () => {
      mockDb.mockReturnValue(makeDbChain([]) as any);
      const result = await filter.check({ title: '正常标题', content: '我想买彩票代购赚大钱！' });
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('sensitive_word');
      expect(result.detail).toContain('彩票代购');
    });

    it('标题含敏感词时同样拦截', async () => {
      mockDb.mockReturnValue(makeDbChain([]) as any);
      const result = await filter.check({ title: '色情内容分享', content: '这是足够长的正文内容，确保通过长度检测的字符串文本正文' });
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('sensitive_word');
    });

    it('无敏感词时通过敏感词检测', async () => {
      mockDb.mockReturnValue(makeDbChain([]) as any);
      // 确保内容字符数 >= MIN_CONTENT_CHARS (default 50)
      const normalContent = '这是一篇正常的跑团经验分享帖子，详细讲述了我们团队在克苏鲁神话世界中的调查经历，涉及各种有趣的规则运用场景。';
      const result = await filter.check({ title: '我的跑团经历', content: normalContent });
      expect(result.passed).toBe(true);
    });
  });

  // ── 过短文本 ─────────────────────────────────────────────────────────────
  describe('过短文本检测', () => {
    it(`正文字符数 < ${MIN_CONTENT_CHARS} 时 passed=false, reason=too_short`, async () => {
      mockDb.mockReturnValue(makeDbChain([]) as any);
      const shortContent = '太短了';  // 3 字
      const result = await filter.check({ title: '标题', content: shortContent });
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('too_short');
      expect(result.detail).toContain('阈值');
    });

    it(`正文字符数恰好等于 ${MIN_CONTENT_CHARS} 时通过`, async () => {
      mockDb.mockReturnValue(makeDbChain([]) as any);
      const exactContent = '跑'.repeat(MIN_CONTENT_CHARS);
      const result = await filter.check({ title: '标题', content: exactContent });
      // 恰好等于阈值视为通过（条件是 < MIN_CONTENT_CHARS）
      expect(result.passed).toBe(true);
    });
  });

  // ── 重复率检测 ────────────────────────────────────────────────────────────
  describe('重复率检测', () => {
    it('与已有帖子内容完全相同时 passed=false, reason=too_similar', async () => {
      // 确保内容足够长（>= 50 字符）以通过长度检测，再测重复率
      const existingContent = '这是一篇已经存在于数据库中的完整跑团故事帖子，详细讲述了我们整个调查小组前往调查一个充满古老谜题的神秘地下城的全过程。';
      mockDb.mockReturnValue(makeDbChain([{ content: existingContent }]) as any);

      const result = await filter.check({ title: '标题', content: existingContent });
      expect(result.passed).toBe(false);
      expect(result.reason).toBe('too_similar');
    });

    it('与已有帖子内容完全不同时通过', async () => {
      const existingContent = '在阴暗的档案室里，调查员翻遍了所有文件，终于找到了失踪教授留下的最后一条线索，那是一张画满奇异符文的羊皮纸地图。';
      mockDb.mockReturnValue(makeDbChain([{ content: existingContent }]) as any);

      // 完全不同的内容：规则讨论，与故事帖几乎无交集
      const differentContent = '新手玩家常见困惑：属性检定和技能检定的本质区别在于，前者检定基础属性，后者检定专项培养的技能，选择时优先使用对应技能。';
      const result = await filter.check({ title: '新手问题', content: differentContent });
      expect(result.passed).toBe(true);
    });

    it('DB 无历史帖子时重复率检测直接通过', async () => {
      mockDb.mockReturnValue(makeDbChain([]) as any);
      const content = '这是一篇全新的跑团故事分享帖，讲述了我们整个调查小组在大城市背景下进行的现代克苏鲁神话调查任务的完整经历。';
      const result = await filter.check({ title: '全新故事', content });
      expect(result.passed).toBe(true);
    });
  });

  // ── 常量导出 ──────────────────────────────────────────────────────────────
  describe('常量', () => {
    it('MIN_CONTENT_CHARS 是正整数', () => {
      expect(Number.isInteger(MIN_CONTENT_CHARS)).toBe(true);
      expect(MIN_CONTENT_CHARS).toBeGreaterThan(0);
    });

    it('MAX_REPEAT_RATIO 在 0-1 范围内', () => {
      expect(MAX_REPEAT_RATIO).toBeGreaterThan(0);
      expect(MAX_REPEAT_RATIO).toBeLessThanOrEqual(1);
    });
  });
});
