import { z } from 'zod';
import yaml from 'yaml';
import type { AtomRegistry } from './registry';
import type { GraphDef } from './executor';

// InputSource schema
const InputSourceSchema = z.union([
  z.object({ type: z.literal('static'), value: z.unknown() }),
  z.object({ type: z.literal('ref'), node_id: z.string(), output_key: z.string() }),
]);

// GraphNodeDef schema
const GraphNodeDefSchema = z.object({
  node_id: z.string().min(1),
  atom_type: z.string().min(1),
  inputs: z.record(z.string(), InputSourceSchema),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

// GraphDef schema - use z.ZodSchema to avoid strict type-level mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GraphDefSchema: z.ZodSchema<any> = z.object({
  nodes: z.array(GraphNodeDefSchema),
  output_node_id: z.string().min(1),
});

// Ruleset YAML schema
export const RulesetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow semver format (x.y.z)'),
  parent_ruleset_id: z.string().optional().nullable(),
  atoms: z.record(
    z.string(),
    z.object({
      type: z.string().min(1),
      config: z.record(z.string(), z.unknown()).optional(),
    })
  ).default({}),
  connections: z.array(
    z.object({
      from_node: z.string(),
      from_output: z.string(),
      to_node: z.string(),
      to_input: z.string(),
    })
  ).default([]),
  commands: z.record(
    z.string(),
    z.object({
      graph: GraphDefSchema,
      description: z.string().optional(),
    })
  ).default({}),
  character_card_schema: z.record(z.string(), z.unknown()).default({}),
  status: z.enum(['draft', 'published']).optional().default('draft'),
});

export type RulesetYamlData = z.infer<typeof RulesetSchema>;

/**
 * 校验 Ruleset 的 atoms 定义是否引用了已注册的原子类型
 */
export function validateRuleset(
  rulesetData: unknown,
  registry: AtomRegistry
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Schema validation
  const parsed = RulesetSchema.safeParse(rulesetData);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
    };
  }

  const data = parsed.data;

  // Validate atom types are registered
  for (const [atomName, atomDef] of Object.entries(data.atoms)) {
    if (!registry.has(atomDef.type)) {
      errors.push(`atoms.${atomName}: unknown atom type '${atomDef.type}'. Registered: [${registry.types().join(', ')}]`);
    }
  }

  // Validate command graphs reference valid atom types
  for (const [cmdName, cmdDef] of Object.entries(data.commands)) {
    for (const node of cmdDef.graph.nodes) {
      // Check if atom_type is in local atoms or global registry
      const isLocalAtom = node.atom_type in data.atoms;
      const isRegistered = registry.has(node.atom_type);
      if (!isLocalAtom && !isRegistered) {
        errors.push(`commands.${cmdName}.graph.nodes[${node.node_id}]: unknown atom_type '${node.atom_type}'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

const YAML_MAX_BYTES = 512 * 1024; // 512 KB

/**
 * 从 YAML 字符串解析 Ruleset
 */
export function parseRulesetYAML(yamlString: string): unknown {
  if (Buffer.byteLength(yamlString, 'utf8') > YAML_MAX_BYTES) {
    throw new Error('YAML content too large (max 512 KB)');
  }
  return yaml.parse(yamlString);
}
