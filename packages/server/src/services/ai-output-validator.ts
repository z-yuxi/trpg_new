/**
 * AI 输出校验层
 *
 * 职责：在路由层解析 AI 原始返回后立即校验，拦截结构损坏或违规修改。
 *
 * 保护规则：
 *   1. JSON 结构完整性 — issues / entities 数组必须存在且每项满足必要字段
 *   2. 骰子表达式保护 — 1d6 / 2d100 / 1D20 等不得出现在 suggestion 中被改写
 *   3. TRPG 系统专名保护 — SAN / HP / MP / DC / AC / PC / NPC / GM 等缩写不得被改写
 *   4. 自定义术语保护 — 调用方传入的白名单术语不得出现于 suggestion 中变形后的版本
 */

// 骰子表达式正则（大小写兼容）
const DICE_RE = /\b\d+[dD]\d+(?:[+-]\d+)?\b/g;

// TRPG 系统固有缩写保护名单
const SYSTEM_TERMS = new Set([
  'SAN', 'HP', 'MP', 'AP', 'SP', 'EP',
  'DC', 'AC', 'PC', 'NPC', 'GM', 'DM', 'PL',
  'STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA',
  'CR', 'XP', 'CP', 'GP', 'SP', 'PP',
]);

// ──────────────────────────────────────────────────────────────────────────────
// check-text 校验
// ──────────────────────────────────────────────────────────────────────────────

export interface CheckTextIssue {
  type: 'typo' | 'punctuation' | 'term' | 'style';
  original: string;
  suggestion: string;
  reason: string;
}

export interface CheckTextOutput {
  issues: CheckTextIssue[];
}

/**
 * 校验并清洗 check-text 的 AI 输出。
 *
 * @param parsed   已 JSON.parse 的对象（未知结构）
 * @param ruleTerms  用户传入的术语白名单（不得被修改建议改写）
 * @returns        合法的 CheckTextOutput（过滤掉不合规的 issue 条目）
 * @throws         当顶层结构不合法时（issues 字段不存在或非数组）
 */
export function validateCheckTextOutput(
  parsed: unknown,
  ruleTerms: string[] = [],
): CheckTextOutput {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('issues' in parsed) ||
    !Array.isArray((parsed as any).issues)
  ) {
    throw new Error('AI_OUTPUT_INVALID: check-text 响应缺少 issues 数组');
  }

  const raw = (parsed as any).issues as unknown[];
  const validTypes = new Set(['typo', 'punctuation', 'term', 'style']);

  const issues: CheckTextIssue[] = [];
  for (const item of raw) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as any).original !== 'string' ||
      typeof (item as any).suggestion !== 'string' ||
      typeof (item as any).reason !== 'string' ||
      !validTypes.has((item as any).type)
    ) {
      // 跳过结构不完整的条目
      continue;
    }

    const issue = item as CheckTextIssue;

    // 骰子表达式保护：original 含骰子表达式时，suggestion 中不得修改它
    if (DICE_RE.test(issue.original)) {
      DICE_RE.lastIndex = 0;
      const origDice = issue.original.match(DICE_RE) ?? [];
      const diceModified = origDice.some((dice) => !issue.suggestion.includes(dice));
      if (diceModified) { DICE_RE.lastIndex = 0; continue; }
    }
    DICE_RE.lastIndex = 0; // 重置有状态正则

    // original 与 suggestion 完全相同时，跳过（无实际修改建议）
    if (issue.original === issue.suggestion) continue;

    // 系统专名保护：original 含受保护缩写时，suggestion 不得将其删除
    const origUpperWords = issue.original.match(/\b[A-Z]{2,5}\b/g) ?? [];
    const violatesSystemTerm = origUpperWords
      .filter((w) => SYSTEM_TERMS.has(w))
      .some((w) => !issue.suggestion.includes(w));
    if (violatesSystemTerm) continue;

    // 自定义术语保护：original 含白名单术语时，suggestion 必须原样保留
    const violatesRuleTerm = ruleTerms.some(
      (term) => issue.original.includes(term) && !issue.suggestion.includes(term),
    );
    if (violatesRuleTerm) continue;

    issues.push(issue);
  }

  return { issues };
}

// ──────────────────────────────────────────────────────────────────────────────
// import-module 校验
// ──────────────────────────────────────────────────────────────────────────────

export type EntityType = 'npc' | 'scene' | 'clue' | 'item' | 'event';

export interface ModuleEntity {
  type: EntityType;
  name: string;
  description: string;
  mentions: string[];
}

export interface ImportModuleOutput {
  entities: ModuleEntity[];
}

/**
 * 校验并清洗 import-module 的 AI 输出。
 *
 * @param parsed        已 JSON.parse 的对象
 * @param termWhitelist 用户传入的术语白名单（实体名称必须原样保留）
 * @returns             合法的 ImportModuleOutput
 * @throws              当顶层结构不合法时
 */
export function validateImportModuleOutput(
  parsed: unknown,
  termWhitelist: string[] = [],
): ImportModuleOutput {
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('entities' in parsed) ||
    !Array.isArray((parsed as any).entities)
  ) {
    throw new Error('AI_OUTPUT_INVALID: import-module 响应缺少 entities 数组');
  }

  const raw = (parsed as any).entities as unknown[];
  const validEntityTypes = new Set<string>(['npc', 'scene', 'clue', 'item', 'event']);

  const entities: ModuleEntity[] = [];
  for (const item of raw) {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as any).name !== 'string' ||
      !(item as any).name.trim() ||
      typeof (item as any).description !== 'string' ||
      !validEntityTypes.has((item as any).type)
    ) {
      continue;
    }

    const entity: ModuleEntity = {
      type: (item as any).type as EntityType,
      name: (item as any).name.trim(),
      description: (item as any).description.slice(0, 200), // 截断过长描述
      mentions: Array.isArray((item as any).mentions)
        ? ((item as any).mentions as unknown[])
            .filter((m): m is string => typeof m === 'string')
            .slice(0, 10)
        : [],
    };

    // 术语白名单保护：若名称与白名单某术语相似但被改写，丢弃
    // （简化：仅检查名称中是否含有白名单术语的变形，使用字符串包含检测）
    const suspiciousNameChange = termWhitelist.some((term) => {
      // 如果某白名单术语与实体名称完全不同但又相似（莱文斯坦距离 ≤ 1），
      // 可能是被 AI 自行改写了，这里用简单启发规则：仅当原始文本中存在该术语
      // 且实体名称既不包含该术语又与其长度相近时视为可疑
      const similar = term.length >= 2 && Math.abs(term.length - entity.name.length) <= 1;
      return similar && !entity.name.includes(term) && entity.name !== term;
    });
    if (suspiciousNameChange) continue;

    entities.push(entity);
  }

  return { entities };
}

// ──────────────────────────────────────────────────────────────────────────────
// 通用 JSON 提取工具
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 从 AI 原始返回文本中安全提取 JSON 对象。
 * 处理 AI 偶尔包裹 ```json ... ``` 的情况。
 */
export function extractJsonFromAiOutput(raw: string): unknown {
  // 优先尝试直接解析
  try {
    return JSON.parse(raw);
  } catch {
    // 提取第一个 {...} 块
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // 继续处理
      }
    }
    throw new Error(`AI 输出无法解析为 JSON: ${raw.slice(0, 200)}`);
  }
}
