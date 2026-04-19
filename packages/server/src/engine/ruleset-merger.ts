import type { Ruleset } from '@trpg/shared';

/**
 * 合并子规则集和父规则集
 * 子规则集字段覆盖父规则集同名字段；
 * atoms/commands/connections 等对象字段做深度合并（子覆盖父）
 */
export function mergeRulesets(child: Partial<Ruleset>, parent: Ruleset): Ruleset {
  const parentAtoms = (parent.atoms as Record<string, unknown>) ?? {};
  const childAtoms = (child.atoms as Record<string, unknown>) ?? {};
  const mergedAtoms = { ...parentAtoms, ...childAtoms };

  const parentCommands = (parent.commands as Record<string, unknown>) ?? {};
  const childCommands = (child.commands as Record<string, unknown>) ?? {};
  const mergedCommands = { ...parentCommands, ...childCommands };

  const parentConnections = (parent.connections as unknown[]) ?? [];
  const childConnections = (child.connections as unknown[]) ?? [];
  const mergedConnections = [...parentConnections, ...childConnections];

  const parentSchema = (parent.character_card_schema as Record<string, unknown>) ?? {};
  const childSchema = (child.character_card_schema as Record<string, unknown>) ?? {};
  const mergedSchema = { ...parentSchema, ...childSchema };

  return {
    id: child.id ?? parent.id,
    author_id: child.author_id ?? parent.author_id,
    name: child.name ?? parent.name,
    version: child.version ?? parent.version,
    description: child.description ?? parent.description ?? '',
    parent_ruleset_id: child.parent_ruleset_id !== undefined ? child.parent_ruleset_id : parent.parent_ruleset_id,
    atoms: mergedAtoms,
    commands: mergedCommands,
    connections: mergedConnections,
    character_card_schema: mergedSchema,
    status: child.status ?? parent.status,
    created_at: child.created_at ?? parent.created_at,
  };
}
