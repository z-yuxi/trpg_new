import type { GraphDef } from './executor';
import type { Ruleset } from '@trpg/shared';
import { DEFAULT_COMMANDS, GENERAL_COMMAND_KEYS, type CommandDef } from './command-defaults';
import { parseCommand } from './command-parser';

/** 三层解析结果 */
export interface ResolvedCommand {
  /** 命令名 */
  name: string;
  /** 执行图 */
  graph: GraphDef;
  description: string;
  /** 命令定义层（调试用）*/
  layer: 'custom' | 'preset' | 'general';
  /** 解析后的参数（已应用 param_map） */
  parsedParams: Record<string, string>;
  /** 位置参数映射定义（透传给 service 注入） */
  param_map?: Array<{ positional: number; key: string }>;
}

/**
 * 从规则集的 commands 字段中提取自定义命令列表。
 * 支持两种格式：
 *   - 旧格式：Record<trigger, { graph, description? }>
 *   - 新格式：{ custom_commands: CustomCommand[], supported_commands: string[] }
 */
function extractRulesetCustomCommands(
  ruleset: Ruleset
): Array<{ trigger: string; aliases: string[]; graph: GraphDef; description: string; param_map?: Array<{ positional: number; key: string }> }> {
  const raw = ruleset.commands as Record<string, unknown>;
  if (!raw || typeof raw !== 'object') return [];

  // 新格式
  if (Array.isArray((raw as { custom_commands?: unknown }).custom_commands)) {
    return (raw as { custom_commands: Array<{ trigger: string; aliases?: string[]; description?: string; graph: GraphDef; param_map?: Array<{ positional: number; key: string }> }> }).custom_commands.map((c) => ({
      trigger: c.trigger,
      aliases: c.aliases ?? [],
      graph: c.graph,
      description: c.description ?? c.trigger,
      param_map: c.param_map,
    }));
  }

  // 旧格式：每个 key 直接是 trigger
  return Object.entries(raw).map(([key, val]) => {
    const v = val as { graph: GraphDef; description?: string };
    return { trigger: key, aliases: [], graph: v.graph, description: v.description ?? key };
  });
}

/**
 * 从规则集获取声明支持的预置命令列表。
 * 若无声明，默认支持所有预置命令。
 */
function extractSupportedPresets(ruleset: Ruleset): string[] {
  const raw = ruleset.commands as Record<string, unknown>;
  if (raw && Array.isArray((raw as { supported_commands?: unknown }).supported_commands)) {
    return (raw as { supported_commands: string[] }).supported_commands;
  }
  // 旧格式没有 supported_commands 声明，允许所有 DEFAULT_COMMANDS
  return Object.keys(DEFAULT_COMMANDS);
}

/**
 * 将位置参数（arg0, arg1, ...）按 param_map 映射为具名参数。
 */
function applyParamMap(
  params: Record<string, string>,
  paramMap: Array<{ positional: number; key: string }> | undefined
): Record<string, string> {
  if (!paramMap || paramMap.length === 0) return params;
  const result = { ...params };
  for (const { positional, key } of paramMap) {
    const positionalVal = params[`arg${positional}`];
    if (positionalVal !== undefined && !(key in result)) {
      result[key] = positionalVal;
    }
  }
  return result;
}

/**
 * 三层命令解析：
 *   1. 规则集自定义命令（精确 trigger 或 aliases 匹配）
 *   2. 规则集声明支持的平台预置命令
 *   3. 通用命令（r / rh / nn，始终可用）
 *
 * @param input  完整命令字符串，如 "/rc 侦查 60"
 * @param ruleset 当前规则集
 * @returns 解析结果，找不到时返回 null
 */
export function resolveCommand(input: string, ruleset: Ruleset): ResolvedCommand | null {
  let parsed;
  try {
    parsed = parseCommand(input);
  } catch {
    // 命令字符串无法解析（如含非法字符）→ 直接返回 null
    return null;
  }
  const name = parsed.command;

  // ── 第一层：规则集自定义命令 ────────────────────────────────────────
  const customCommands = extractRulesetCustomCommands(ruleset);
  const custom = customCommands.find(
    (c) => c.trigger === name || c.aliases.includes(name)
  );
  if (custom) {
    const params = applyParamMap(parsed.params, custom.param_map);
    return { name: custom.trigger, graph: custom.graph, description: custom.description, layer: 'custom', parsedParams: params, param_map: custom.param_map };
  }

  // ── 第三层（优先于第二层检查）：通用命令（r/rh/nn，始终可用，不依赖规则集） ─
  // 注意：通用命令优先级在三层中最低，但需在规则集 supported_commands 之前判断，
  // 防止 r/rh/nn 被当作"规则集预置命令"返回错误 layer。
  if ((GENERAL_COMMAND_KEYS as readonly string[]).includes(name) && DEFAULT_COMMANDS[name]) {
    const cmd = DEFAULT_COMMANDS[name];
    const params = applyParamMap(parsed.params, cmd.param_map);
    return { name, graph: cmd.graph, description: cmd.description, layer: 'general', parsedParams: params, param_map: cmd.param_map };
  }

  // ── 第二层：规则集声明支持的平台预置命令 ─────────────────────────────
  const supportedPresets = extractSupportedPresets(ruleset);
  if (supportedPresets.includes(name) && DEFAULT_COMMANDS[name]) {
    const cmd = DEFAULT_COMMANDS[name];
    const params = applyParamMap(parsed.params, cmd.param_map);
    return { name, graph: cmd.graph, description: cmd.description, layer: 'preset', parsedParams: params, param_map: cmd.param_map };
  }

  return null;
}

/**
 * 向后兼容：返回扁平化的命令映射（规则集命令 > 平台默认）。
 * 仅供旧代码和测试使用；新代码请使用 resolveCommand()。
 */
export function resolveCommands(
  ruleset: Ruleset
): Record<string, CommandDef> {
  const customCommands = extractRulesetCustomCommands(ruleset);
  const customMap: Record<string, CommandDef> = {};
  for (const c of customCommands) {
    customMap[c.trigger] = { graph: c.graph, description: c.description, param_map: c.param_map };
  }
  return { ...DEFAULT_COMMANDS, ...customMap };
}
