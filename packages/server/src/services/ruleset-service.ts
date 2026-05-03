import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { Ruleset, RulesetStatus, ExecuteRequest, ExecuteResponse, RulesetVersion, RulesetVersionDiff, ForkResult, MergeResult, MergeConflict } from '@trpg/shared';
import type { RulesetRecipeSource, RulesetCompiledGraph, LegacyMeta } from '@trpg/shared';
import type { Recipe } from '@trpg/shared';
import { wrapLegacyGraphAsRawRecipe } from '@trpg/shared';
import { resolveCommand } from '../engine/command-resolver';
import { parseCommand } from '../engine/command-parser';
import { GraphExecutor, type GraphDef } from '../engine/executor';
import { globalRegistry } from '../engine/registry';
import { validateRecipe, validateRecipeSource, compileRecipe } from '../engine/recipe-compiler';
import type { RecipeValidationError } from '../engine/recipe-compiler';

/** Recipe 编译器版本（缓存失效依据之一） */
const COMPILER_VERSION = '1.0.0';

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function rowToRuleset(row: Record<string, unknown>): Ruleset {
  // 旧格式判断：数据库 legacy 列为 1 或未设置 recipe_source
  const legacyFlag = row['legacy'];
  const recipeSourceRaw = row['recipe_source'];
  const compiledGraphRaw = row['compiled_graph'];

  const recipeSource = parseJsonField<RulesetRecipeSource | null>(recipeSourceRaw, null);
  const compiledGraph = parseJsonField<RulesetCompiledGraph | null>(compiledGraphRaw, null);
  const legacy = legacyFlag == null
    ? recipeSource == null  // 未设置 legacy 列时，按是否有 recipe_source 推断
    : Boolean(Number(legacyFlag));

  return {
    id: row['id'] as string,
    author_id: (row['author_id'] as string) ?? null,
    name: row['name'] as string,
    version: row['version'] as string,
    description: (row['description'] as string) ?? '',
    parent_ruleset_id: (row['parent_ruleset_id'] as string) ?? null,
    atoms: parseJsonField<object>(row['atoms'], {}),
    connections: parseJsonField<object>(row['connections'], {}),
    commands: parseJsonField<object>(row['commands'], {}),
    character_card_schema: parseJsonField<object>(row['character_card_schema'], {}),
    status: row['status'] as RulesetStatus,
    created_at: row['created_at'] as Date,
    // Recipe 主线字段
    recipe_source: recipeSource,
    compiled_graph: compiledGraph,
    legacy,
    legacy_meta: legacy && !recipeSource
      ? ({ origin: 'atoms_connections', migration_status: 'pending' } as LegacyMeta)
      : (legacy && recipeSource ? ({ origin: 'raw_recipe_wrapped', migration_status: 'pending' } as LegacyMeta) : null),
    reader_settings: parseJsonField<import('@trpg/shared').ReaderSettings | null>(row['reader_settings'], null),
  };
}

/**
 * 对 recipe_source 执行 validate + compile，返回编译产物缓存对象。
 * 若校验失败，抛出含结构化错误的异常。
 */
function compileRecipeSource(source: RulesetRecipeSource): {
  compiledGraph: RulesetCompiledGraph;
  errors: RecipeValidationError[];
} {
  // 1. 批量校验
  const errorMap = validateRecipeSource(source);
  if (errorMap.size > 0) {
    const allErrors: RecipeValidationError[] = [];
    for (const [recipeId, errs] of errorMap) {
      errs.forEach((e) => allErrors.push({ ...e, path: `recipes[${recipeId}].${e.path}` }));
    }
    return { compiledGraph: null as unknown as RulesetCompiledGraph, errors: allErrors };
  }

  // 2. 编译每个 recipe，收集产物
  const compiledRecipes: Record<string, unknown> = {};
  const compileErrors: RecipeValidationError[] = [];

  for (const recipe of source.recipes) {
    const result = compileRecipe(recipe, source.recipes);
    if (!result.success) {
      result.errors.forEach((e) =>
        compileErrors.push({ ...e, path: `recipes[${recipe.id}].${e.path}` }),
      );
    } else {
      compiledRecipes[recipe.id] = result.graph;
    }
  }

  if (compileErrors.length > 0) {
    return { compiledGraph: null as unknown as RulesetCompiledGraph, errors: compileErrors };
  }

  const compiledGraph: RulesetCompiledGraph = {
    // 兼容执行器的顶层 atoms/connections（聚合所有 recipe 的节点，第一个 recipe 作为默认入口）
    atoms: compiledRecipes,
    connections: {},
    compiled_at: new Date().toISOString(),
    compiler_version: COMPILER_VERSION,
  };

  return { compiledGraph, errors: [] };
}

/** 将命令参数注入图节点的 static 输入（键名匹配时覆盖） */
function injectParamsIntoGraph(graph: GraphDef, params: Record<string, unknown>): GraphDef {
  if (!params || Object.keys(params).length === 0) return graph;
  const nodes = graph.nodes.map((node) => ({
    ...node,
    inputs: Object.fromEntries(
      Object.entries(node.inputs).map(([key, source]) => {
        if (source.type === 'static' && key in params) {
          // 尝试将数字字符串转换为数值（如 threshold="60" → 60）
          const raw = params[key];
          const coerced = (typeof raw === 'string' && raw !== '' && !isNaN(Number(raw)))
            ? Number(raw)
            : raw;
          return [key, { type: 'static' as const, value: coerced }];
        }
        return [key, source];
      })
    ),
  }));
  return { ...graph, nodes };
}

export class RulesetService {
  /** 获取当前用户的所有规则集（含草稿） */
  async listMine(userId: string): Promise<Ruleset[]> {
    const rows = await db('rulesets')
      .where({ author_id: userId })
      .orderBy('created_at', 'desc');
    return (rows as Record<string, unknown>[]).map(rowToRuleset);
  }

  /** 获取规则集列表（分页 + 筛选） */
  async list(params: {
    status?: RulesetStatus;
    keyword?: string;
    author_id?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: Ruleset[]; total: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 20));
    const offset = (page - 1) * limit;

    let query = db('rulesets');
    if (params.status) {
      query = query.where('status', params.status);
    }
    if (params.author_id) {
      query = query.where('author_id', params.author_id);
    }
    if (params.keyword) {
      const kw = `%${params.keyword}%`;
      query = query.where((q) => {
        q.where('name', 'like', kw).orWhere('description', 'like', kw);
      });
    }

    const [{ count }] = await query.clone().count<{ count: string }[]>('id as count');
    const rows = await query.orderBy('created_at', 'desc').limit(limit).offset(offset);

    return {
      data: (rows as Record<string, unknown>[]).map(rowToRuleset),
      total: Number(count),
    };
  }

  /** 按 ID 获取规则集 */
  async findById(id: string): Promise<Ruleset | null> {
    const row = await db('rulesets').where({ id }).first();
    if (!row) return null;
    return rowToRuleset(row as Record<string, unknown>);
  }

  /** 创建规则集 */
  async create(params: {
    name: string;
    version: string;
    description?: string;
    author_id: string;
    parent_ruleset_id?: string;
    character_card_schema?: object;
    /** 若提供 recipe_source，服务端自动 validate + compile */
    recipe_source?: RulesetRecipeSource;
  }): Promise<Ruleset> {
    const id = generateId();

    // Recipe 主线：自动编译
    let compiledGraph: RulesetCompiledGraph | null = null;
    let isLegacy = 1; // 默认 legacy=1（无 recipe_source 时）

    if (params.recipe_source) {
      const { compiledGraph: cg, errors } = compileRecipeSource(params.recipe_source);
      if (errors.length > 0) {
        throw Object.assign(new Error('Recipe validation failed'), {
          code: 'RECIPE_VALIDATION_FAILED',
          errors,
        });
      }
      compiledGraph = cg;
      isLegacy = 0;
    }

    await db('rulesets').insert({
      id,
      author_id: params.author_id,
      name: params.name,
      version: params.version,
      description: params.description ?? '',
      parent_ruleset_id: params.parent_ruleset_id ?? null,
      atoms: JSON.stringify({}),
      connections: JSON.stringify({}),
      commands: JSON.stringify({}),
      character_card_schema: JSON.stringify(params.character_card_schema ?? {}),
      status: 'draft',
      recipe_source: params.recipe_source ? JSON.stringify(params.recipe_source) : null,
      compiled_graph: compiledGraph ? JSON.stringify(compiledGraph) : null,
      legacy: isLegacy,
    });
    return (await this.findById(id))!;
  }

  /** 更新规则集（仅作者可操作） */
  async update(
    id: string,
    userId: string,
    data: Partial<{
      name: string;
      version: string;
      description: string;
      atoms: object;
      connections: object;
      commands: object;
      character_card_schema: object;
      /** 新 Recipe 主线：提交 recipe_source 时自动 validate + compile */
      recipe_source: RulesetRecipeSource;
      /** 叙阅器配置 §14.8 */
      reader_settings: import('@trpg/shared').ReaderSettings | null;
    }>
  ): Promise<Ruleset> {
    const ruleset = await this.findById(id);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    if (ruleset.status === 'published') throw Object.assign(new Error('Cannot edit a published ruleset'), { code: 'BAD_REQUEST' });

    const updatePayload: Record<string, unknown> = {};
    if (data.name !== undefined) updatePayload['name'] = data.name;
    if (data.version !== undefined) updatePayload['version'] = data.version;
    if (data.description !== undefined) updatePayload['description'] = data.description;

    // ── 收紧保护：已迁移到 Recipe（legacy=0）的规则集不允许再写 atoms/connections ──
    const hasAtomUpdate = data.atoms !== undefined || data.connections !== undefined;
    if (hasAtomUpdate && !ruleset.legacy) {
      throw Object.assign(
        new Error('This ruleset uses Recipe format. atoms/connections are not allowed.'),
        { code: 'CANNOT_UPDATE_ATOMS_ON_RECIPE_RULESET' },
      );
    }

    if (data.atoms !== undefined) updatePayload['atoms'] = JSON.stringify(data.atoms);
    if (data.connections !== undefined) updatePayload['connections'] = JSON.stringify(data.connections);
    if (data.commands !== undefined) updatePayload['commands'] = JSON.stringify(data.commands);
    if (data.character_card_schema !== undefined) updatePayload['character_card_schema'] = JSON.stringify(data.character_card_schema);

    // ── Recipe 主线：保存时自动 validate + compile ──────────────────────────
    if (data.recipe_source !== undefined) {
      const { compiledGraph, errors } = compileRecipeSource(data.recipe_source);
      if (errors.length > 0) {
        throw Object.assign(new Error('Recipe validation failed'), {
          code: 'RECIPE_VALIDATION_FAILED',
          errors,
        });
      }
      updatePayload['recipe_source'] = JSON.stringify(data.recipe_source);
      updatePayload['compiled_graph'] = JSON.stringify(compiledGraph);
      updatePayload['legacy'] = 0;
    }

    if (data.reader_settings !== undefined) {
      updatePayload['reader_settings'] = data.reader_settings === null
        ? null
        : JSON.stringify(data.reader_settings);
    }

    if (Object.keys(updatePayload).length > 0) {
      await db('rulesets').where({ id }).update(updatePayload);
    }
    return (await this.findById(id))!;
  }

  /** 发布规则集（draft → published，仅作者） */
  async publish(id: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(id);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    if (ruleset.status === 'published') throw Object.assign(new Error('Already published'), { code: 'BAD_REQUEST' });

    await db('rulesets').where({ id }).update({ status: 'published' });
    return (await this.findById(id))!;
  }

  /**
   * 执行规则集命令（三层解析：自定义 → 规则集预置 → 通用）。
   * Recipe 主线：当规则集有 recipe_source.command_recipe_map 时，优先从 compiled_graph 取图。
   * @param ruleset_id  路径参数中的规则集 ID
   * @param body        请求体（新格式，不含 ruleset_id）
   */
  async executeCommand(ruleset_id: string, body: ExecuteRequest): Promise<ExecuteResponse> {
    const ruleset = await this.findById(ruleset_id);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });

    let graph: GraphDef | null = null;
    let commandName: string = '';
    let parsedParams: Record<string, unknown> = body.params ?? {};

    // ── Recipe 主线：command_recipe_map → compiled_graph.atoms[recipeId] ──
    if (!ruleset.legacy && ruleset.recipe_source?.command_recipe_map && ruleset.compiled_graph) {
      // 尝试 parseCommand（/cmd 格式），失败则直接用原始命令名作为 map key
      let parsed: ReturnType<typeof parseCommand> | null = null;
      try { parsed = parseCommand(body.command); } catch { /* fall through */ }

      const lookupKey = parsed?.command ?? body.command;
      const recipeId = ruleset.recipe_source.command_recipe_map[lookupKey];
      if (recipeId) {
        const compiledAtoms = ruleset.compiled_graph.atoms as Record<string, unknown>;
        const recipeGraph = compiledAtoms[recipeId] as GraphDef | undefined;
        if (recipeGraph && recipeGraph.nodes) {
          graph = recipeGraph;
          commandName = lookupKey;
          parsedParams = { ...(parsed?.params ?? {}), ...parsedParams };
        }
      }
    }

    // ── Legacy 路径：三层命令解析器 ─────────────────────────────────────────
    if (!graph) {
      const resolved = resolveCommand(body.command, ruleset);
      if (!resolved) {
        throw Object.assign(
          new Error(`Command '${body.command}' not found in ruleset or platform defaults`),
          { code: 'NOT_FOUND' }
        );
      }
      graph = resolved.graph;
      commandName = resolved.name;
      parsedParams = { ...resolved.parsedParams, ...parsedParams };
      // 透传 param_map 注入逻辑（已在 resolved.parsedParams 中完成）
    }

    // 将解析参数注入图的 static 输入
    let injectedGraph = injectParamsIntoGraph(graph, parsedParams);

    // 注入角色数据（优先 mock_context，其次真实角色）
    const needsCharacterData = injectedGraph.nodes.some((n) => n.atom_type === 'character_skill_reader');
    const needsFormulaVars = injectedGraph.nodes.some((n) => n.atom_type === 'formula_eval');
    if (needsCharacterData || needsFormulaVars) {
      let characterData: { attributes: Record<string, number>; skills: Record<string, number>; resources: Record<string, { current: number; max: number }> } | null = null;

      if (body.mock_context) {
        characterData = {
          attributes: body.mock_context.attributes,
          skills: body.mock_context.skills,
          resources: body.mock_context.resources,
        };
      } else if (body.context?.character_id) {
        const charRow = await db('character_sheets').where({ id: body.context.character_id }).first();
        if (charRow) {
          characterData = {
            attributes: typeof charRow.attributes === 'string' ? JSON.parse(charRow.attributes) : (charRow.attributes ?? {}),
            skills: typeof charRow.skills === 'string' ? JSON.parse(charRow.skills) : (charRow.skills ?? {}),
            resources: typeof charRow.derived_max === 'string' ? JSON.parse(charRow.derived_max) : (charRow.derived_max ?? {}),
          };
        }
      }

      if (characterData) {
        if (needsCharacterData) {
          injectedGraph = injectParamsIntoGraph(injectedGraph, { character_data: characterData });
        }
        if (needsFormulaVars) {
          // formula_eval 需要平铺的属性+技能字典作为 variables
          const formulaVariables: Record<string, number> = {
            ...characterData.attributes,
            ...characterData.skills,
          };
          injectedGraph = injectParamsIntoGraph(injectedGraph, { variables: formulaVariables });
        }
      }
    }

    const executor = new GraphExecutor(globalRegistry);
    const result = executor.execute(injectedGraph);

    // 从日志中提取骰子投掷信息
    const diceRolls: ExecuteResponse['dice_rolls'] = [];
    for (const log of result.logs) {
      if (log.node_type === 'dice_roll') {
        const out = log.output as { total?: number; details?: string } | null;
        const expr = (log.inputs['expression'] as string) ?? '';
        diceRolls.push({
          expression: expr,
          value: out?.total ?? 0,
          detail: out?.details ?? '',
        });
      }
    }

    // 生成可读结果描述
    const resultText = result.success
      ? (typeof result.output === 'object' && result.output !== null
        ? (() => {
          const o = result.output as Record<string, unknown>;
          if ('passed' in o) return (o['passed'] as boolean) ? '成功' : '失败';
          if ('total' in o) return `结果：${o['total']}`;
          if ('value' in o) return `结果：${o['value']}`;
          return JSON.stringify(result.output);
        })()
        : String(result.output))
      : (result.error ?? '执行失败');

    return {
      success: result.success,
      result: resultText,
      dice_rolls: diceRolls,
      logs: result.logs,
      warnings: [],
      ...(result.error ? { error: result.error } : {}),
      ...(result.failed_node_id !== undefined ? { failed_node_id: result.failed_node_id, failed_stage: 'graph_execute' as const } : {}),
      ...(result.error_code ? { error_code: result.error_code } : {}),
      command_name: commandName,
      raw_output: result.output,
    };
  }

  // ── 版本快照 ──────────────────────────────────────────────────────────────

  /** 创建版本快照（保存时调用） */
  async saveVersion(rulesetId: string, changelog: string, userId: string): Promise<RulesetVersion> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });

    // 计算版本号（基于现有版本数量）
    const count = await db('ruleset_versions').where({ ruleset_id: rulesetId }).count('id as cnt').first();
    const nextNum = (Number((count as any)?.cnt ?? 0)) + 1;
    const version_number = `${ruleset.version}-snapshot.${nextNum}`;

    const id = generateId();
    const snapshot = {
      atoms: ruleset.atoms,
      connections: ruleset.connections,
      commands: ruleset.commands,
      character_card_schema: ruleset.character_card_schema,
      // Recipe 主线字段一并快照
      recipe_source: ruleset.recipe_source ?? null,
      compiled_graph: ruleset.compiled_graph ?? null,
    };
    await db('ruleset_versions').insert({
      id,
      ruleset_id: rulesetId,
      version_number,
      snapshot: JSON.stringify(snapshot),
      changelog: changelog ?? '',
    });
    // 更新 latest_version_id
    await db('rulesets').where({ id: rulesetId }).update({ latest_version_id: id });
    return (await this.getVersion(id))!;
  }

  /** 获取版本历史 */
  async listVersions(rulesetId: string): Promise<RulesetVersion[]> {
    const rows = await db('ruleset_versions')
      .where({ ruleset_id: rulesetId })
      .orderBy('created_at', 'desc');
    return (rows as Record<string, unknown>[]).map(this._rowToVersion);
  }

  /** 获取指定版本 */
  async getVersion(versionId: string): Promise<RulesetVersion | null> {
    const row = await db('ruleset_versions').where({ id: versionId }).first();
    if (!row) return null;
    return this._rowToVersion(row as Record<string, unknown>);
  }

  /** 回滚到指定版本 */
  async rollbackToVersion(rulesetId: string, versionId: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });

    const version = await this.getVersion(versionId);
    if (!version || version.ruleset_id !== rulesetId) {
      throw Object.assign(new Error('Version not found for this ruleset'), { code: 'NOT_FOUND' });
    }
    const { atoms, connections, commands, character_card_schema, recipe_source, compiled_graph } = version.snapshot as {
      atoms: object; connections: object; commands: object; character_card_schema: object;
      recipe_source?: RulesetRecipeSource | null;
      compiled_graph?: RulesetCompiledGraph | null;
    };
    await db('rulesets').where({ id: rulesetId }).update({
      atoms: JSON.stringify(atoms),
      connections: JSON.stringify(connections),
      commands: JSON.stringify(commands),
      character_card_schema: JSON.stringify(character_card_schema),
      recipe_source: recipe_source ? JSON.stringify(recipe_source) : null,
      compiled_graph: compiled_graph ? JSON.stringify(compiled_graph) : null,
      legacy: recipe_source ? 0 : 1,
    });
    return (await this.findById(rulesetId))!;
  }

  /** 对比两个版本（基于 node_id 做集合运算） */
  async compareVersions(versionIdA: string, versionIdB: string): Promise<RulesetVersionDiff> {
    const [vA, vB] = await Promise.all([this.getVersion(versionIdA), this.getVersion(versionIdB)]);
    if (!vA || !vB) throw Object.assign(new Error('Version not found'), { code: 'NOT_FOUND' });

    const atomsA = ((vA.snapshot.atoms as any[]) ?? []).map((n: any) => n.node_id as string);
    const atomsB = ((vB.snapshot.atoms as any[]) ?? []).map((n: any) => n.node_id as string);
    const setA = new Set(atomsA);
    const setB = new Set(atomsB);

    const added = atomsB.filter((id) => !setA.has(id));
    const removed = atomsA.filter((id) => !setB.has(id));
    const both = atomsB.filter((id) => setA.has(id));
    // 简单比较：序列化后对比
    const modified = both.filter((id) => {
      const a = (vA.snapshot.atoms as any[]).find((n: any) => n.node_id === id);
      const b = (vB.snapshot.atoms as any[]).find((n: any) => n.node_id === id);
      return JSON.stringify(a) !== JSON.stringify(b);
    });

    return {
      nodes: {
        added: added.map((nodeId) => ({ node_id: nodeId, atom_type: 'unknown' })),
        removed: removed.map((nodeId) => ({ node_id: nodeId, atom_type: 'unknown' })),
        modified: modified.map((nodeId) => ({ node_id: nodeId, atom_type: 'unknown', changed_fields: [] })),
      },
      connections: {
        added: [],
        removed: [],
      },
      commands: {
        added: [],
        removed: [],
        modified: [],
      },
      // 兼容旧字段
      added_nodes: added,
      removed_nodes: removed,
      modified_nodes: modified,
      added_connections: [],
      removed_connections: [],
    };
  }

  _rowToVersion(row: Record<string, unknown>): RulesetVersion {
    const snapshot = typeof row['snapshot'] === 'string' ? JSON.parse(row['snapshot']) : (row['snapshot'] as object);
    return {
      id: row['id'] as string,
      ruleset_id: row['ruleset_id'] as string,
      version_number: row['version_number'] as string,
      snapshot: snapshot as RulesetVersion['snapshot'],
      changelog: (row['changelog'] as string) ?? '',
      created_at: row['created_at'] as Date,
    };
  }

  // ── 发布状态机 ─────────────────────────────────────────────────────────────

  /** draft → reviewing（同时自动 approve → published，V1.0 无人工审核） */
  async submitForReview(id: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(id);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    if (ruleset.status !== 'draft') throw Object.assign(new Error(`Cannot submit from status '${ruleset.status}'`), { code: 'BAD_REQUEST' });

    // V1.0 自动审核通过
    await db('rulesets').where({ id }).update({ status: 'published' });
    // 自动创建版本快照
    await this.saveVersion(id, '发布审核快照', userId).catch(() => { /* non-critical */ });
    return (await this.findById(id))!;
  }

  /** published → deprecated */
  async deprecate(id: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(id);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    if (ruleset.status !== 'published') throw Object.assign(new Error('Can only deprecate published rulesets'), { code: 'BAD_REQUEST' });
    await db('rulesets').where({ id }).update({ status: 'deprecated' });
    return (await this.findById(id))!;
  }

  // ── Fork 与继承 ───────────────────────────────────────────────────────────

  /** Fork 一个规则集 */
  async forkRuleset(sourceId: string, userId: string): Promise<ForkResult> {
    const source = await this.findById(sourceId);
    if (!source) throw Object.assign(new Error('Source ruleset not found'), { code: 'NOT_FOUND' });
    if (source.status !== 'published') throw Object.assign(new Error('Can only fork published rulesets'), { code: 'BAD_REQUEST' });

    const currentVersion = (source as any).lock_version ?? 0;
    const newId = generateId();
    await db('rulesets').insert({
      id: newId,
      author_id: userId,
      name: `${source.name}（Fork）`,
      version: '0.1.0',
      description: source.description,
      parent_id: sourceId,
      parent_ruleset_id: sourceId,
      atoms: JSON.stringify(source.atoms),
      connections: JSON.stringify(source.connections),
      commands: JSON.stringify(source.commands),
      character_card_schema: JSON.stringify(source.character_card_schema),
      status: 'draft',
      fork_count: 0,
      lock_version: 0,
    });

    // 乐观锁更新 fork_count
    const affected = await db('rulesets')
      .where({ id: sourceId, lock_version: currentVersion })
      .update({ fork_count: db.raw('fork_count + 1'), lock_version: currentVersion + 1 });

    if (affected === 0) {
      // 并发冲突：重新读取最新 fork_count
      const updated = await this.findById(sourceId);
      return { new_ruleset: (await this.findById(newId))!, source_fork_count: (updated as any)?.fork_count ?? 0 };
    }

    return {
      new_ruleset: (await this.findById(newId))!,
      source_fork_count: (source as any).fork_count + 1,
    };
  }

  /** 从上游 parent 合并变更 */
  async mergeFromParent(rulesetId: string, userId: string): Promise<MergeResult> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    const parentId = (ruleset as any).parent_id ?? ruleset.parent_ruleset_id;
    if (!parentId) throw Object.assign(new Error('No parent ruleset'), { code: 'BAD_REQUEST' });

    const parent = await this.findById(parentId);
    if (!parent) throw Object.assign(new Error('Parent ruleset not found'), { code: 'NOT_FOUND' });

    const ourAtoms = (ruleset.atoms as any[]) ?? [];
    const theirAtoms = (parent.atoms as any[]) ?? [];

    const ourMap = new Map(ourAtoms.map((n: any) => [n.node_id, n]));
    const theirMap = new Map(theirAtoms.map((n: any) => [n.node_id, n]));

    const merged: any[] = [];
    const conflicts: MergeConflict[] = [];

    // 处理 parent 的所有节点
    for (const [id, theirNode] of theirMap) {
      if (ourMap.has(id)) {
        const ourNode = ourMap.get(id)!;
        if (JSON.stringify(ourNode) === JSON.stringify(theirNode)) {
          merged.push(ourNode);
        } else {
          // 双方都修改了，产生冲突
          conflicts.push({ node_id: id, type: 'modified_both', our_node: ourNode, their_node: theirNode });
          merged.push(ourNode); // 默认保留本地
        }
      } else {
        // parent 新增的节点，自动合并
        merged.push(theirNode);
      }
    }
    // 本地独有的节点（本地新增）
    for (const [id, ourNode] of ourMap) {
      if (!theirMap.has(id)) {
        merged.push(ourNode);
      }
    }

    return {
      status: conflicts.length > 0 ? 'conflicts' : 'clean',
      merged_graph: { atoms: merged, connections: (parent.connections as any[]) ?? [] },
      conflicts,
    };
  }

  // ── Recipe 测试运行 ───────────────────────────────────────────────────────

  /**
   * 单个 Recipe 的测试运行（不依赖规则集，用于编辑器实时预览）。
   * 流程：validate → compile → execute（用 mock 输入）→ 返回 TestRecipeResponse
   */
  async testRecipe(params: {
    recipe: Recipe;
    allRecipes?: Recipe[];
    test_inputs?: Record<string, unknown>;
    mock_context?: {
      attributes: Record<string, number>;
      skills: Record<string, number>;
      resources: Record<string, { current: number; max: number }>;
    };
  }): Promise<{
    success: boolean;
    output: unknown;
    logs: unknown[];
    compiled_preview: { atom_count: number; connection_count: number };
    error_code?: string;
    error_message?: string;
    failed_stage?: string;
    failed_node_id?: string | null;
  }> {
    const { recipe, allRecipes = [], test_inputs = {}, mock_context } = params;

    // 1. 校验
    const { valid, errors: validErrors } = validateRecipe(recipe, allRecipes);
    if (!valid) {
      return {
        success: false,
        output: null,
        logs: [],
        compiled_preview: { atom_count: 0, connection_count: 0 },
        error_code: 'RECIPE_VALIDATION_FAILED',
        error_message: validErrors.map((e) => `${e.path}: ${e.message}`).join('; '),
        failed_stage: 'validate',
        failed_node_id: null,
      };
    }

    // 2. 编译
    const compileResult = compileRecipe(recipe, allRecipes);
    if (!compileResult.success || !compileResult.graph) {
      return {
        success: false,
        output: null,
        logs: [],
        compiled_preview: { atom_count: 0, connection_count: 0 },
        error_code: 'RECIPE_VALIDATION_FAILED',
        error_message: compileResult.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
        failed_stage: 'compile',
        failed_node_id: null,
      };
    }

    const graph = compileResult.graph;
    const atomCount = graph.nodes.length;
    // connections 数量：graph 没有 connections 字段，用 ref 类型的 inputs 估算
    const connCount = graph.nodes.reduce((acc, n) => acc + Object.values(n.inputs).filter((i) => i.type === 'ref').length, 0);

    // 3. 注入测试参数
    let injectedGraph = injectParamsIntoGraph(graph, test_inputs);

    // 4. 注入角色数据
    if (mock_context) {
      injectedGraph = injectParamsIntoGraph(injectedGraph, { character_data: mock_context });
      // formula_eval 需要平铺属性+技能作为 variables
      if (injectedGraph.nodes.some((n) => n.atom_type === 'formula_eval')) {
        const formulaVariables: Record<string, number> = {
          ...mock_context.attributes,
          ...mock_context.skills,
        };
        injectedGraph = injectParamsIntoGraph(injectedGraph, { variables: formulaVariables });
      }
    }

    // 5. 执行
    const executor = new GraphExecutor(globalRegistry);
    const result = executor.execute(injectedGraph);

    return {
      success: result.success,
      output: result.output,
      logs: result.logs,
      compiled_preview: { atom_count: atomCount, connection_count: connCount },
      ...(result.error ? { error_code: 'EXECUTION_ERROR', error_message: result.error, failed_stage: 'execute', failed_node_id: result.failed_node_id ?? null } : {}),
    };
  }

  // ── 旧格式迁移 ────────────────────────────────────────────────────────────

  /**
   * 将旧格式（atoms/connections）的规则集迁移为 raw Recipe 格式。
   * 迁移后：legacy=false, recipe_source 存储包装后的 raw recipe, compiled_graph 更新。
   * 仅限作者操作，且规则集必须是 legacy=true。
   */
  async migrateToRecipe(rulesetId: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });
    if (ruleset.author_id !== userId) throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    if (!ruleset.legacy) throw Object.assign(new Error('Ruleset is already in Recipe format'), { code: 'BAD_REQUEST' });

    // 包装旧格式为 raw recipe
    const wrappedRecipe = wrapLegacyGraphAsRawRecipe(
      ruleset.atoms as object,
      ruleset.connections as object,
    );
    const recipeSource: RulesetRecipeSource = {
      recipes: [wrappedRecipe],
      command_recipe_map: {},  // 旧 commands 结构不做自动映射，需用户手动配置
    };

    const { compiledGraph, errors } = compileRecipeSource(recipeSource);
    // raw recipe 理论上不会有编译错误；如有则保持 legacy 不变并抛出
    if (errors.length > 0) {
      throw Object.assign(new Error('Migration compile failed'), {
        code: 'RECIPE_VALIDATION_FAILED',
        errors,
      });
    }

    await db('rulesets').where({ id: rulesetId }).update({
      recipe_source: JSON.stringify(recipeSource),
      compiled_graph: JSON.stringify(compiledGraph),
      legacy: 0,
    });

    return (await this.findById(rulesetId))!;
  }
}

export const rulesetService = new RulesetService();
