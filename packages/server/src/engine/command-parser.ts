import type { ExecuteRequest, NormalizedModifiers } from '@trpg/shared';

export interface ParsedCommand {
  command: string;        // 命令名称，如 "roll", "check", "attack"
  params: Record<string, string>;
  raw: string;            // 原始输入
}

/**
 * 解析命令字符串
 * 支持格式：
 *   /roll 3d6+2
 *   /check skill=侦查 difficulty=50
 *   /attack target=goblin weapon=sword
 */
export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    throw new Error(`Command must start with '/': "${trimmed}"`);
  }

  const withoutSlash = trimmed.slice(1);
  const parts = withoutSlash.split(/\s+/);

  if (parts.length === 0 || !parts[0]) {
    throw new Error('Command name cannot be empty');
  }

  const command = parts[0].toLowerCase();
  if (!command.match(/^[a-z_][a-z0-9_]*$/)) {
    throw new Error(`Invalid command name: "${command}"`);
  }

  const params: Record<string, string> = {};
  const restParts = parts.slice(1);

  // Parse params: either "key=value" pairs or first positional as "expression"
  let hasKeyValuePairs = false;
  for (const part of restParts) {
    if (part.includes('=')) {
      hasKeyValuePairs = true;
      break;
    }
  }

  if (hasKeyValuePairs) {
    for (const part of restParts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0) {
        const key = part.slice(0, eqIdx);
        const value = part.slice(eqIdx + 1);
        params[key] = value;
      }
    }
  } else if (restParts.length > 0) {
    // Positional: treat all rest as "expression" for roll-like commands (backward compat)
    params['expression'] = restParts.join(' ');
    // Also provide individual positional args (arg0, arg1, ...) for commands that need them
    restParts.forEach((part, i) => {
      params[`arg${i}`] = part;
    });
  }

  return { command, params, raw: input };
}

/**
 * 将解析后的命令 + 上下文组装为 ExecuteRequest（新格式，不含 ruleset_id）
 */
export function buildExecuteRequest(
  parsed: ParsedCommand,
  context: { character_id: string; campaign_id: string; scene_id?: string }
): ExecuteRequest {
  return {
    command: parsed.command,
    params: parsed.params,
    context,
  };
}

// ─── § 十六① ParsedIntent ──────────────────────────────────────────────────

/**
 * 语义化解析结果（IntentParse 阶段产物，§ 十六.2①）
 */
export interface ParsedIntent {
  /** 命令主名，如 "rc"、"roll"、"attack" */
  command_name: string;
  /** 主要参数（技能名、表达式等） */
  primary_arg?: string;
  /** 已知修饰符片段（尚未做冲突校验，原始形态） */
  raw_modifiers: string[];
  /** 剩余具名参数 */
  named_params: Record<string, string>;
  /** 原始输入 */
  raw_text: string;
}

/** 修饰符关键词映射（可在规则集层叠加） */
const MODIFIER_KEYWORDS: ReadonlySet<string> = new Set([
  'b', 'bonus', 'p', 'penalty',
  'h', 'hard', 'e', 'extreme',
  'adv', 'advantage', 'dis', 'disadvantage',
  'dc', 'tb',
]);

/**
 * IntentParse 阶段：将原始命令字符串解析为语义化的 ParsedIntent（§ 十六①）
 * - 第一个非 key=value 参数视为 primary_arg
 * - 命中 MODIFIER_KEYWORDS 的单词收入 raw_modifiers
 * - 其余 key=value 收入 named_params
 */
export function parseIntent(input: string): ParsedIntent {
  const parsed = parseCommand(input);
  const { command, params, raw } = parsed;

  const rawModifiers: string[] = [];
  const namedParams: Record<string, string> = {};
  let primaryArg: string | undefined;

  // 先收集所有 arg0/arg1/... 以判定 primary_arg
  const positional: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (/^arg\d+$/.test(k)) {
      const idx = parseInt(k.slice(3), 10);
      positional[idx] = v;
    }
  }

  // expression 参数视为 primary_arg（backward compat）
  if (params['expression'] !== undefined) {
    primaryArg = params['expression'];
  } else if (positional.length > 0) {
    primaryArg = positional[0];
    // 其余位置参数：如果是修饰符关键词收入 raw_modifiers
    for (let i = 1; i < positional.length; i++) {
      const part = positional[i].toLowerCase();
      if (MODIFIER_KEYWORDS.has(part)) {
        rawModifiers.push(part);
      }
    }
  }

  // 具名参数（非 argN / expression）
  for (const [k, v] of Object.entries(params)) {
    if (/^arg\d+$/.test(k)) continue;
    if (k === 'expression') continue;
    if (MODIFIER_KEYWORDS.has(k.toLowerCase())) {
      rawModifiers.push(`${k}=${v}`);
    } else {
      namedParams[k] = v;
    }
  }

  return {
    command_name: command,
    primary_arg: primaryArg,
    raw_modifiers: rawModifiers,
    named_params: namedParams,
    raw_text: raw,
  };
}

// ─── § 十六③ ModifierExtract ───────────────────────────────────────────────

/**
 * ModifierExtract 阶段：将 raw_modifiers 规范化为 NormalizedModifiers（§ 十六③）
 * 冲突规则（§ 十八.2）：
 *   - bonus + penalty 同时出现 → 抛出 RUNTIME_MODIFIER_CONFLICT
 *   - h/e 取最后出现值（last-wins）
 *   - adv + dis 同时出现 → 相互抵消
 *   - dc_override 与 target_bonus 同时存在时 dc_override 优先（调用方不再使用 target_bonus）
 */
export function extractModifiers(
  rawModifiers: string[],
  namedParams: Record<string, string>
): { modifiers: NormalizedModifiers; conflict?: string } {
  const m: NormalizedModifiers = {};
  let hasBonus = false;
  let hasPenalty = false;
  let hasAdv = false;
  let hasDis = false;
  let difficultyLevel: number | undefined;

  const allTokens = [
    ...rawModifiers,
    ...Object.entries(namedParams).map(([k, v]) => `${k}=${v}`),
  ];

  for (const token of allTokens) {
    const lower = token.toLowerCase();

    // b=N / bonus=N / p=N / penalty=N
    const bMatch = /^(?:b|bonus)=(\d+)$/.exec(lower) ?? /^(?:b|bonus)$/.exec(lower);
    if (bMatch) {
      m.bonus_dice = bMatch[1] !== undefined ? Math.min(9, parseInt(bMatch[1], 10)) : 1;
      hasBonus = true;
      continue;
    }
    const pMatch = /^(?:p|penalty)=(\d+)$/.exec(lower) ?? /^(?:p|penalty)$/.exec(lower);
    if (pMatch) {
      m.penalty_dice = pMatch[1] !== undefined ? Math.min(9, parseInt(pMatch[1], 10)) : 1;
      hasPenalty = true;
      continue;
    }

    // h / hard  (difficulty_level last-wins: 取更高级)
    if (lower === 'h' || lower === 'hard') {
      difficultyLevel = Math.max(difficultyLevel ?? 0, 1);
      continue;
    }
    // e / extreme
    if (lower === 'e' || lower === 'extreme') {
      difficultyLevel = Math.max(difficultyLevel ?? 0, 2);
      continue;
    }

    // adv / advantage
    if (lower === 'adv' || lower === 'advantage') {
      hasAdv = true;
      continue;
    }
    // dis / disadvantage
    if (lower === 'dis' || lower === 'disadvantage') {
      hasDis = true;
      continue;
    }

    // dc=N (override target value)
    const dcMatch = /^dc=(\d+)$/.exec(lower);
    if (dcMatch) {
      m.dc_override = parseInt(dcMatch[1], 10);
      continue;
    }

    // tb=N (target bonus)
    const tbMatch = /^tb=([+-]?\d+)$/.exec(lower);
    if (tbMatch) {
      m.target_bonus = parseInt(tbMatch[1], 10);
      continue;
    }
  }

  // 冲突检测（§ 十八.2）
  if (hasBonus && hasPenalty) {
    return { modifiers: {}, conflict: 'RUNTIME_MODIFIER_CONFLICT: bonus and penalty cannot coexist' };
  }

  // adv + dis 同时出现 → 相互抵消（§ 十八.2）
  if (hasAdv && hasDis) {
    // 不设任何 advantage/disadvantage
  } else if (hasAdv) {
    m.advantage = true;
  } else if (hasDis) {
    m.disadvantage = true;
  }

  if (difficultyLevel !== undefined) {
    m.difficulty_level = difficultyLevel;
  }

  // dc_override 优先：若两者同存，删除 target_bonus（§ 十八.3）
  if (m.dc_override !== undefined && m.target_bonus !== undefined) {
    delete m.target_bonus;
  }

  return { modifiers: m };
}
