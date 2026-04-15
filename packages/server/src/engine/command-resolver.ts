import type { GraphDef } from './executor';
import type { Ruleset } from '@trpg/shared';
import { DEFAULT_COMMANDS } from './command-defaults';

/**
 * 解析最终可用命令列表
 * 规则集命令优先于平台默认命令
 */
export function resolveCommands(
  ruleset: Ruleset
): Record<string, { graph: GraphDef; description: string }> {
  const rulesetCommands = (ruleset.commands as Record<string, { graph: GraphDef; description?: string }>) ?? {};

  // Merge: ruleset overrides defaults
  return {
    ...DEFAULT_COMMANDS,
    ...Object.fromEntries(
      Object.entries(rulesetCommands).map(([key, val]) => [
        key,
        { graph: val.graph, description: val.description ?? key },
      ])
    ),
  };
}
