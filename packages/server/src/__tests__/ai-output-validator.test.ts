/**
 * AI 输出校验层单元测试
 *
 * 覆盖：
 *   - validateCheckTextOutput：JSON 结构校验、骰子保护、专名保护、术语保护
 *   - validateImportModuleOutput：JSON 结构校验、实体字段校验
 *   - extractJsonFromAiOutput：Markdown 代码块剥离
 */
import { describe, it, expect } from 'vitest';
import {
  validateCheckTextOutput,
  validateImportModuleOutput,
  extractJsonFromAiOutput,
} from '../services/ai-output-validator';

// ──────────────────────────────────────────────────────────────────────────────
// extractJsonFromAiOutput
// ──────────────────────────────────────────────────────────────────────────────
describe('extractJsonFromAiOutput', () => {
  it('直接解析有效 JSON 对象', () => {
    const result = extractJsonFromAiOutput('{"issues":[]}');
    expect(result).toEqual({ issues: [] });
  });

  it('从 Markdown 代码块中提取 JSON', () => {
    const result = extractJsonFromAiOutput('```json\n{"entities":[]}\n```');
    expect(result).toEqual({ entities: [] });
  });

  it('从混杂文本中提取第一个 JSON 对象', () => {
    const result = extractJsonFromAiOutput('以下是结果：\n{"issues":[{"type":"typo"}]}');
    expect((result as any).issues).toHaveLength(1);
  });

  it('无效 JSON 抛出错误', () => {
    expect(() => extractJsonFromAiOutput('这不是JSON')).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// validateCheckTextOutput
// ──────────────────────────────────────────────────────────────────────────────
describe('validateCheckTextOutput', () => {
  it('合法输出正常通过', () => {
    const result = validateCheckTextOutput({
      issues: [
        { type: 'typo', original: '错误', suggestion: '正确', reason: '错别字' },
      ],
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('typo');
  });

  it('缺少 issues 字段时抛出错误', () => {
    expect(() => validateCheckTextOutput({ noIssues: [] })).toThrow('AI_OUTPUT_INVALID');
  });

  it('issues 为非数组时抛出错误', () => {
    expect(() => validateCheckTextOutput({ issues: 'not-array' })).toThrow('AI_OUTPUT_INVALID');
  });

  it('顶层为非对象时抛出错误', () => {
    expect(() => validateCheckTextOutput('plain string')).toThrow('AI_OUTPUT_INVALID');
  });

  it('type 字段非法的 issue 被过滤', () => {
    const result = validateCheckTextOutput({
      issues: [
        { type: 'invalid_type', original: 'a', suggestion: 'b', reason: 'r' },
        { type: 'typo', original: 'x', suggestion: 'y', reason: 'ok' },
      ],
    });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('typo');
  });

  it('缺少必要字段的 issue 被过滤', () => {
    const result = validateCheckTextOutput({
      issues: [
        { type: 'typo', original: '错' }, // 缺少 suggestion 和 reason
        { type: 'style', original: 'a', suggestion: 'b', reason: 'ok' },
      ],
    });
    expect(result.issues).toHaveLength(1);
  });

  it('suggestion 删除系统专名（SAN）的 issue 被过滤', () => {
    const result = validateCheckTextOutput({
      issues: [
        // original 含 SAN，但 suggestion 中没有 SAN → 违规
        { type: 'style', original: 'SAN 值不足', suggestion: '理智值不足', reason: '改写' },
      ],
    });
    expect(result.issues).toHaveLength(0);
  });

  it('suggestion 保留系统专名时通过', () => {
    const result = validateCheckTextOutput({
      issues: [
        { type: 'style', original: '检查SAN', suggestion: '检查SAN值', reason: '补全' },
      ],
    });
    expect(result.issues).toHaveLength(1);
  });

  it('rule_terms 中的术语被删除时 issue 被过滤', () => {
    const result = validateCheckTextOutput(
      {
        issues: [
          { type: 'term', original: '拉兹的护符', suggestion: '某个护符', reason: '简化' },
        ],
      },
      ['拉兹'],
    );
    expect(result.issues).toHaveLength(0);
  });

  it('rule_terms 中的术语被保留时通过', () => {
    const result = validateCheckTextOutput(
      {
        issues: [
          { type: 'typo', original: '拉兹的护符错', suggestion: '拉兹的护符', reason: '删错字' },
        ],
      },
      ['拉兹'],
    );
    expect(result.issues).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// validateImportModuleOutput
// ──────────────────────────────────────────────────────────────────────────────
describe('validateImportModuleOutput', () => {
  it('合法输出正常通过', () => {
    const result = validateImportModuleOutput({
      entities: [
        { type: 'npc', name: '神秘老人', description: '酒馆中的陌生者', mentions: [] },
        { type: 'scene', name: '古老图书馆', description: '藏有禁书', mentions: ['第三章'] },
      ],
    });
    expect(result.entities).toHaveLength(2);
  });

  it('缺少 entities 字段时抛出错误', () => {
    expect(() => validateImportModuleOutput({ data: [] })).toThrow('AI_OUTPUT_INVALID');
  });

  it('非法 type 的实体被过滤', () => {
    const result = validateImportModuleOutput({
      entities: [
        { type: 'invalid', name: '未知', description: '' },
        { type: 'clue', name: '血迹', description: '现场痕迹' },
      ],
    });
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('clue');
  });

  it('name 为空的实体被过滤', () => {
    const result = validateImportModuleOutput({
      entities: [
        { type: 'item', name: '', description: '无名物品' },
        { type: 'item', name: '匕首', description: '锋利的武器' },
      ],
    });
    expect(result.entities).toHaveLength(1);
  });

  it('description 超出 200 字被截断', () => {
    const longDesc = 'x'.repeat(300);
    const result = validateImportModuleOutput({
      entities: [{ type: 'event', name: '爆炸', description: longDesc }],
    });
    expect(result.entities[0].description).toHaveLength(200);
  });

  it('mentions 超出 10 条被截断', () => {
    const result = validateImportModuleOutput({
      entities: [
        {
          type: 'npc',
          name: 'Boss',
          description: '首领',
          mentions: Array.from({ length: 15 }, (_, i) => `第${i}章`),
        },
      ],
    });
    expect(result.entities[0].mentions).toHaveLength(10);
  });

  it('mentions 中非字符串元素被过滤', () => {
    const result = validateImportModuleOutput({
      entities: [
        {
          type: 'npc',
          name: 'Hero',
          description: '英雄',
          mentions: ['序章', 123, null, '第二幕'],
        },
      ],
    });
    expect(result.entities[0].mentions).toEqual(['序章', '第二幕']);
  });
});
