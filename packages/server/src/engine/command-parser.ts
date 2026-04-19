import type { ExecuteRequest } from '@trpg/shared';

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
