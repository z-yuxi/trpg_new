/**
 * ContentQualityFilter — 机器人内容进入前台前的最小质量过滤
 *
 * 三道过滤：
 * 1. 敏感词检测 (SENSITIVE_WORDS)    — 包含任意敏感词 → 拒绝
 * 2. 过短文本检测 (MIN_CONTENT_CHARS) — 正文字符数不足 → 拒绝
 * 3. 重复率检测 (MAX_REPEAT_RATIO)    — 正文前 N 字与最近帖子相似度过高 → 拒绝
 *
 * 阈值均可通过环境变量覆盖：
 *   BOT_QUALITY_MIN_CONTENT_CHARS   default 50
 *   BOT_QUALITY_MAX_REPEAT_RATIO    default 0.7  (Jaccard 相似度)
 *   BOT_QUALITY_RECENT_COMPARE_N    default 20   (对比最近 N 条机器人帖子)
 *
 * 使用方式：
 *   const result = await contentQualityFilter.check({ title, content });
 *   if (!result.passed) { // 拒绝发布 }
 */

import { db } from '../db';

// ─── 敏感词列表 ──────────────────────────────────────────────────────────────
// 仅收录明确违规词，不做倾向性过滤
const SENSITIVE_WORDS: readonly string[] = [
  // 色情/暴力
  '色情', '裸体', '卖淫', '援交',
  // 赌博
  '赌博', '网赌', '博彩', '彩票代购',
  // 政治敏感（平台规范要求）
  '法轮功', '天安门事件',
  // 诈骗关键词
  '加微信', '扫码转账', '私信我', '招代理',
];

// ─── 阈值常量 ────────────────────────────────────────────────────────────────
export const MIN_CONTENT_CHARS = Number(process.env.BOT_QUALITY_MIN_CONTENT_CHARS ?? 50);
export const MAX_REPEAT_RATIO = Number(process.env.BOT_QUALITY_MAX_REPEAT_RATIO ?? 0.7);
const RECENT_COMPARE_N = Number(process.env.BOT_QUALITY_RECENT_COMPARE_N ?? 20);

export type FilterRejectReason = 'sensitive_word' | 'too_short' | 'too_similar';

export interface FilterResult {
  passed: boolean;
  reason?: FilterRejectReason;
  detail?: string;
}

// ─── Jaccard 词袋相似度 ──────────────────────────────────────────────────────
/**
 * 将文本切分为字符 bigram 集合，计算 Jaccard 相似度。
 * 中文场景 bigram 比单字效果更好（能识别连续重复短语）。
 */
function bigramSet(text: string): Set<string> {
  const s = new Set<string>();
  const clean = text.replace(/\s+/g, '');
  for (let i = 0; i < clean.length - 1; i++) {
    s.add(clean.slice(i, i + 2));
  }
  return s;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

// ─── ContentQualityFilter ────────────────────────────────────────────────────

export class ContentQualityFilter {
  /**
   * 对帖子（标题 + 正文）执行三道过滤。
   * DB 重复率检测只在前两道通过后才查 DB（减少不必要 IO）。
   */
  async check(params: {
    title: string;
    content: string;
  }): Promise<FilterResult> {
    const { title, content } = params;
    const fullText = `${title} ${content}`;

    // ① 敏感词
    const sensitiveHit = this._checkSensitiveWords(fullText);
    if (sensitiveHit) {
      return { passed: false, reason: 'sensitive_word', detail: `命中敏感词：${sensitiveHit}` };
    }

    // ② 过短文本（正文字符数，不计标题）
    const contentLen = content.replace(/\s/g, '').length;
    if (contentLen < MIN_CONTENT_CHARS) {
      return {
        passed: false,
        reason: 'too_short',
        detail: `正文字符数 ${contentLen} < 阈值 ${MIN_CONTENT_CHARS}`,
      };
    }

    // ③ 重复率（与最近机器人帖子对比）
    const similarResult = await this._checkDuplication(content);
    if (!similarResult.passed) {
      return similarResult;
    }

    return { passed: true };
  }

  private _checkSensitiveWords(text: string): string | null {
    for (const word of SENSITIVE_WORDS) {
      if (text.includes(word)) return word;
    }
    return null;
  }

  private async _checkDuplication(content: string): Promise<FilterResult> {
    // 取最近 N 条机器人生成的帖子正文
    const rows = await db('forum_threads')
      .where({ is_bot_generated: 1 })
      .orderBy('created_at', 'desc')
      .limit(RECENT_COMPARE_N)
      .select('content') as { content: string }[];

    if (rows.length === 0) return { passed: true };

    const targetBigrams = bigramSet(content);
    for (const row of rows) {
      const existingBigrams = bigramSet(row.content);
      const sim = jaccardSimilarity(targetBigrams, existingBigrams);
      if (sim > MAX_REPEAT_RATIO) {
        return {
          passed: false,
          reason: 'too_similar',
          detail: `与已有机器人帖子相似度 ${(sim * 100).toFixed(1)}% > 阈值 ${(MAX_REPEAT_RATIO * 100).toFixed(0)}%`,
        };
      }
    }

    return { passed: true };
  }
}

export const contentQualityFilter = new ContentQualityFilter();
