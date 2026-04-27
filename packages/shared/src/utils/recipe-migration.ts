/**
 * recipe-migration.ts
 *
 * 旧 atoms/connections 格式 → Recipe 兼容包装工具。
 *
 * 策略：
 *   - 旧格式数据无法无损编辑，但可以被"包装"为 raw recipe，
 *     继续被执行器使用而不丢失功能。
 *   - 包装结果标记 legacy=true 和 legacy_meta.origin='raw_recipe_wrapped'。
 *   - 不自动删除旧 atoms/connections 字段，兼容旧读取路径。
 */

import type {
  Recipe,
  RulesetRecipeSource,
  LegacyMeta,
  RawRecipeParams,
} from '../types/recipe';

/**
 * 将旧格式的 atoms/connections 包装成一个 raw recipe。
 *
 * 包装规则：
 *   - 单个 raw recipe，id = "__legacy_graph__"
 *   - 如果能找到 entry/output 节点则记录，否则留空字符串
 *
 * @param atoms  旧格式 atoms（object 或 object[]）
 * @param connections  旧格式 connections（object 或 object[]）
 * @param entryAtomId  可选：显式指定入口节点 id
 * @param outputAtomId 可选：显式指定输出节点 id
 */
export function wrapLegacyGraphAsRawRecipe(
  atoms: object,
  connections: object,
  entryAtomId?: string,
  outputAtomId?: string,
): Recipe {
  // atoms 可能是 Record<string, {...}> 或 Array<{node_id, ...}>
  const atomsArray: object[] = normalizeAtomsList(atoms);
  const connectionsArray: object[] = normalizeConnectionsList(connections);

  // 自动推断 entry/output（如果没有显式提供）
  const entryId = entryAtomId ?? inferEntryAtomId(atomsArray, connectionsArray);
  const outputId = outputAtomId ?? inferOutputAtomId(atomsArray, connectionsArray);

  const params: RawRecipeParams = {
    atoms: atomsArray,
    connections: connectionsArray,
    entry_atom_id: entryId,
    output_atom_id: outputId,
  };

  return {
    id: '__legacy_graph__',
    type: 'raw',
    name: 'Legacy Graph (兼容包装)',
    description: '由旧 atoms/connections 格式自动包装，仅用于兼容执行，请迁移到 Recipe 格式',
    tags: ['legacy'],
    params,
  };
}

/**
 * 将旧格式规则包数据生成完整的 recipe_source（含 legacy 标记）。
 *
 * @param atoms  旧 atoms 字段
 * @param connections 旧 connections 字段
 * @param commands 旧 commands 字段（用于提取 command_recipe_map，暂不解析，预留）
 */
export function buildLegacyRecipeSource(
  atoms: object,
  connections: object,
  _commands?: object,
): {
  recipe_source: RulesetRecipeSource;
  legacy: true;
  legacy_meta: LegacyMeta;
} {
  const wrappedRecipe = wrapLegacyGraphAsRawRecipe(atoms, connections);

  return {
    recipe_source: {
      recipes: [wrappedRecipe],
    },
    legacy: true,
    legacy_meta: {
      origin: 'raw_recipe_wrapped',
      migration_status: 'pending',
      migration_note: 'Wrapped from legacy atoms/connections. Manual migration to typed Recipe recommended.',
    },
  };
}

/**
 * 判断一个规则集是否为 legacy 格式（没有 recipe_source，只有 atoms/connections）。
 */
export function isLegacyRuleset(ruleset: {
  recipe_source?: unknown;
  atoms?: unknown;
  connections?: unknown;
  legacy?: boolean;
}): boolean {
  // 显式标记优先
  if (ruleset.legacy === true) return true;
  if (ruleset.legacy === false) return false;
  // 有 recipe_source 的视为新格式
  if (ruleset.recipe_source != null) return false;
  // 只有 atoms/connections 的视为旧格式
  return true;
}

// ─── 内部辅助 ──────────────────────────────────────────────────────────────

/**
 * 将 atoms 字段规范化为 object[]。
 * 旧格式可能是 { atomId: { type, ... } } 的映射表，也可能是数组。
 */
function normalizeAtomsList(atoms: object): object[] {
  if (Array.isArray(atoms)) return atoms as object[];
  // Record<string, {...}> → [{node_id: key, ...rest}]
  return Object.entries(atoms as Record<string, object>).map(([key, val]) => ({
    node_id: key,
    ...(val as object),
  }));
}

function normalizeConnectionsList(connections: object): object[] {
  if (Array.isArray(connections)) return connections as object[];
  return [];
}

/**
 * 推断入口节点：没有被任何连接作为 target 的节点（根节点）。
 */
function inferEntryAtomId(atoms: object[], connections: object[]): string {
  const targets = new Set(
    connections.map((c) => (c as Record<string, unknown>)['target'] as string).filter(Boolean),
  );
  const nodeIds = atoms.map((a) => (a as Record<string, unknown>)['node_id'] as string).filter(Boolean);
  const roots = nodeIds.filter((id) => !targets.has(id));
  return roots[0] ?? nodeIds[0] ?? '';
}

/**
 * 推断输出节点：没有对外连接作为 source 的节点（叶节点）。
 */
function inferOutputAtomId(atoms: object[], connections: object[]): string {
  const sources = new Set(
    connections.map((c) => (c as Record<string, unknown>)['source'] as string).filter(Boolean),
  );
  const nodeIds = atoms.map((a) => (a as Record<string, unknown>)['node_id'] as string).filter(Boolean);
  const leaves = nodeIds.filter((id) => !sources.has(id));
  return leaves[leaves.length - 1] ?? nodeIds[nodeIds.length - 1] ?? '';
}
