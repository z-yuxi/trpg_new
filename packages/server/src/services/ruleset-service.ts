import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { Ruleset, RulesetStatus, ExecuteRequest, ExecuteResponse, RulesetVersion, RulesetVersionDiff, ForkResult, MergeResult, MergeConflict } from '@trpg/shared';
import { resolveCommand } from '../engine/command-resolver';
import { GraphExecutor, type GraphDef } from '../engine/executor';
import { globalRegistry } from '../engine/registry';

function rowToRuleset(row: Record<string, unknown>): Ruleset {
  return {
    id: row['id'] as string,
    author_id: (row['author_id'] as string) ?? null,
    name: row['name'] as string,
    version: row['version'] as string,
    description: (row['description'] as string) ?? '',
    parent_ruleset_id: (row['parent_ruleset_id'] as string) ?? null,
    atoms: typeof row['atoms'] === 'string' ? JSON.parse(row['atoms'] as string) : (row['atoms'] as object) ?? {},
    connections: typeof row['connections'] === 'string' ? JSON.parse(row['connections'] as string) : (row['connections'] as object) ?? {},
    commands: typeof row['commands'] === 'string' ? JSON.parse(row['commands'] as string) : (row['commands'] as object) ?? {},
    character_card_schema: typeof row['character_card_schema'] === 'string' ? JSON.parse(row['character_card_schema'] as string) : (row['character_card_schema'] as object) ?? {},
    status: row['status'] as RulesetStatus,
    created_at: row['created_at'] as Date,
  };
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
  }): Promise<Ruleset> {
    const id = generateId();
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
    if (data.atoms !== undefined) updatePayload['atoms'] = JSON.stringify(data.atoms);
    if (data.connections !== undefined) updatePayload['connections'] = JSON.stringify(data.connections);
    if (data.commands !== undefined) updatePayload['commands'] = JSON.stringify(data.commands);
    if (data.character_card_schema !== undefined) updatePayload['character_card_schema'] = JSON.stringify(data.character_card_schema);

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
   * @param ruleset_id  路径参数中的规则集 ID
   * @param body        请求体（新格式，不含 ruleset_id）
   */
  async executeCommand(ruleset_id: string, body: ExecuteRequest): Promise<ExecuteResponse> {
    const ruleset = await this.findById(ruleset_id);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });

    // 三层解析
    const resolved = resolveCommand(body.command, ruleset);
    if (!resolved) {
      throw Object.assign(
        new Error(`Command '${body.command}' not found in ruleset or platform defaults`),
        { code: 'NOT_FOUND' }
      );
    }

    // 将解析参数 + body.params 合并注入图
    const mergedParams: Record<string, unknown> = {
      ...resolved.parsedParams,
      ...(body.params ?? {}),
    };
    let graph = injectParamsIntoGraph(resolved.graph, mergedParams);

    // 注入角色数据（优先 mock_context，其次真实角色）
    const needsCharacterData = graph.nodes.some((n) => n.atom_type === 'character_skill_reader');
    if (needsCharacterData) {
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
        graph = injectParamsIntoGraph(graph, { character_data: characterData });
      }
    }

    const executor = new GraphExecutor(globalRegistry);
    const result = executor.execute(graph);

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
      logs: result.logs.map((l) => ({
        node_id: l.node_id,
        atom_type: l.node_type,
        inputs: l.inputs,
        output: l.output,
        duration_ms: l.duration_ms,
      })),
      ...(result.error ? { error: result.error } : {}),
      command_name: resolved.name,
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
    const { atoms, connections, commands, character_card_schema } = version.snapshot;
    await db('rulesets').where({ id: rulesetId }).update({
      atoms: JSON.stringify(atoms),
      connections: JSON.stringify(connections),
      commands: JSON.stringify(commands),
      character_card_schema: JSON.stringify(character_card_schema),
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
}

export const rulesetService = new RulesetService();
