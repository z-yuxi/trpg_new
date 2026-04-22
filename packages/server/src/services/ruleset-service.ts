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

    return { added_nodes: added, removed_nodes: removed, modified_nodes: modified, added_connections: [], removed_connections: [] };
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
      merged_graph: { atoms: merged, connections: (parent.connections as any[]) ?? [] },
      conflicts,
    };
  }

  /** 首次启动时自动插入一份完整的 CoC 7th 中文规则包（若无任何已发布规则包） */
  async seedCoc7IfEmpty(): Promise<void> {
    const existing = await db('rulesets').where({ status: 'published' }).first();
    if (existing) return;

    // ── 快捷技能检定图（1d100 ≤ 指定技能值）────────────────────────────────
    const skillCheckGraph = (skillName: string) => ({
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'reader', atom_type: 'character_skill_reader',
          inputs: {
            character_data: { type: 'static', value: null },
            field_type: { type: 'static', value: 'skill' },
            field_name: { type: 'static', value: skillName },
          },
        },
        {
          node_id: 'cmp', atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'ref', node_id: 'reader', output_key: 'value' },
            operator: { type: 'static', value: '<=' },
          },
        },
      ],
      output_node_id: 'cmp',
    });

    // ── 快捷属性检定图（1d100 ≤ 指定属性值）────────────────────────────────
    const attrCheckGraph = (attrName: string) => ({
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'reader', atom_type: 'character_skill_reader',
          inputs: {
            character_data: { type: 'static', value: null },
            field_type: { type: 'static', value: 'attribute' },
            field_name: { type: 'static', value: attrName },
          },
        },
        {
          node_id: 'cmp', atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'ref', node_id: 'reader', output_key: 'value' },
            operator: { type: 'static', value: '<=' },
          },
        },
      ],
      output_node_id: 'cmp',
    });

    const COC7_COMMANDS = {
      // ── 常用技能快捷键（对应指令.md中的 ra技能名 格式）─────────────────────
      spot:     { description: '侦察（/spot）',        graph: skillCheckGraph('侦察') },
      listen:   { description: '听力（/listen）',       graph: skillCheckGraph('听力') },
      lib:      { description: '图书馆（/lib）',        graph: skillCheckGraph('图书馆') },
      hide:     { description: '潜行（/hide）',         graph: skillCheckGraph('潜行') },
      psy:      { description: '心理学（/psy）',        graph: skillCheckGraph('心理学') },
      dodge:    { description: '闪避（/dodge）',        graph: skillCheckGraph('闪避') },
      fight:    { description: '格斗（/fight）',        graph: skillCheckGraph('格斗') },
      first:    { description: '急救（/first）',        graph: skillCheckGraph('急救') },
      charm:    { description: '魅惑（/charm）',        graph: skillCheckGraph('魅惑') },
      persuade: { description: '说服（/persuade）',     graph: skillCheckGraph('说服') },
      intim:    { description: '恐吓（/intim）',        graph: skillCheckGraph('恐吓') },
      swim:     { description: '游泳（/swim）',         graph: skillCheckGraph('游泳') },
      climb:    { description: '攀爬（/climb）',        graph: skillCheckGraph('攀爬') },
      jump:     { description: '跳跃（/jump）',         graph: skillCheckGraph('跳跃') },
      throw:    { description: '投掷（/throw）',        graph: skillCheckGraph('投掷') },
      track:    { description: '追踪（/track）',        graph: skillCheckGraph('追踪') },
      occult:   { description: '神秘学（/occult）',     graph: skillCheckGraph('神秘学') },
      myth:     { description: '克苏鲁神话（/myth）',   graph: skillCheckGraph('克苏鲁神话') },
      history:  { description: '历史（/history）',      graph: skillCheckGraph('历史') },
      nature:   { description: '自然学（/nature）',     graph: skillCheckGraph('自然学') },
      medicine: { description: '医学（/medicine）',     graph: skillCheckGraph('医学') },
      science:  { description: '科学（/science）',      graph: skillCheckGraph('科学(生物学)') },
      law:      { description: '法律（/law）',          graph: skillCheckGraph('法律') },
      account:  { description: '会计（/account）',      graph: skillCheckGraph('会计') },
      craft:    { description: '艺术与手工艺（/craft）', graph: skillCheckGraph('艺术与手工艺') },
      disguise: { description: '乔装（/disguise）',     graph: skillCheckGraph('乔装') },
      lockpick: { description: '开锁（/lockpick）',     graph: skillCheckGraph('开锁') },
      elec:     { description: '电气维修（/elec）',     graph: skillCheckGraph('电气维修') },
      mech:     { description: '机械维修（/mech）',     graph: skillCheckGraph('机械维修') },
      photo:    { description: '摄影（/photo）',        graph: skillCheckGraph('摄影') },
      drive:    { description: '驾驶汽车（/drive）',    graph: skillCheckGraph('驾驶汽车') },
      ride:     { description: '骑术（/ride）',         graph: skillCheckGraph('骑术') },
      pistol:   { description: '手枪（/pistol）',       graph: skillCheckGraph('手枪') },
      rifle:    { description: '步枪/霰弹枪（/rifle）', graph: skillCheckGraph('步枪/霰弹枪') },
      melee:    { description: '近战武器（/melee）',    graph: skillCheckGraph('近战武器') },
      survival: { description: '生存（/survival）',     graph: skillCheckGraph('生存') },
      credit:   { description: '信用评级（/credit）',   graph: skillCheckGraph('信用评级') },
      // ── 属性快捷键（对应指令.md中 ra属性名 格式）────────────────────────────
      str:      { description: '力量检定（/str）',    graph: attrCheckGraph('STR') },
      dex:      { description: '敏捷检定（/dex）',    graph: attrCheckGraph('DEX') },
      pow:      { description: '意志检定（/pow）',    graph: attrCheckGraph('POW') },
      con:      { description: '体质检定（/con）',    graph: attrCheckGraph('CON') },
      app:      { description: '外貌检定（/app）',    graph: attrCheckGraph('APP') },
      int:      { description: '智力检定（/int）',    graph: attrCheckGraph('INT') },
      edu:      { description: '教育检定（/edu）',    graph: attrCheckGraph('EDU') },
      luck:     { description: '幸运检定（/luck = POW*5）', graph: attrCheckGraph('POW') },
    };

    const COC7_SCHEMA = {
      attributes: {
        STR: { label: '力量 STR', roll_formula: '3d6*5',    min: 15, max: 90 },
        DEX: { label: '敏捷 DEX', roll_formula: '3d6*5',    min: 15, max: 90 },
        POW: { label: '意志 POW', roll_formula: '3d6*5',    min: 15, max: 90 },
        CON: { label: '体质 CON', roll_formula: '3d6*5',    min: 15, max: 90 },
        APP: { label: '外貌 APP', roll_formula: '3d6*5',    min: 15, max: 90 },
        SIZ: { label: '体型 SIZ', roll_formula: '2d6*5+30', min: 40, max: 90 },
        INT: { label: '智力 INT', roll_formula: '2d6*5+30', min: 40, max: 90 },
        EDU: { label: '教育 EDU', roll_formula: '2d6*5+30', min: 40, max: 99 },
      },
      derived_formulas: {
        HP:    { formula: 'floor((CON + SIZ) / 10)', label: '生命值 HP',   min: 1 },
        MP:    { formula: 'floor(POW / 5)',           label: '魔法值 MP',   min: 0 },
        SAN:   { formula: 'POW',                      label: '理智值 SAN',  min: 0, max: 99 },
        LK:    { formula: 'POW * 5',                  label: '幸运值 LK',   min: 1, max: 99 },
        MOV:   { formula: '8',                        label: '移动速度 MOV' },
        DB:    { formula: '0',                        label: '伤害加值 DB'  },
        Build: { formula: '0',                        label: '体格 Build'   },
      },
      occupations: [
        {
          id: 'doctor', name: '医生',
          skill_points_formula: 'EDU*4',
          skills: ['急救', '心理学', '医学', '说服', '侦察', '图书馆', '科学(生物学)', '科学(药学)'],
        },
        {
          id: 'investigator', name: '私家侦探',
          skill_points_formula: 'EDU*2+INT*2',
          skills: ['格斗', '心理学', '侦察', '图书馆', '说服', '潜行', '乔装', '开锁'],
        },
        {
          id: 'journalist', name: '记者',
          skill_points_formula: 'EDU*4',
          skills: ['历史', '图书馆', '心理学', '说服', '侦察', '摄影', '计算机', '母语'],
        },
        {
          id: 'professor', name: '教授',
          skill_points_formula: 'EDU*4',
          skills: ['图书馆', '历史', '心理学', '说服', '侦察', '考古学', '神秘学', '外语'],
        },
        {
          id: 'police', name: '警察',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['格斗', '急救', '心理学', '侦察', '说服', '驾驶汽车', '恐吓', '手枪'],
        },
        {
          id: 'nurse', name: '护士',
          skill_points_formula: 'EDU*4',
          skills: ['急救', '心理学', '医学', '侦察', '说服', '科学(生物学)', '科学(药学)'],
        },
        {
          id: 'criminal', name: '歹徒',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['格斗', '侦察', '潜行', '驾驶汽车', '恐吓', '开锁', '魅惑', '手枪'],
        },
        {
          id: 'artist', name: '艺术家',
          skill_points_formula: 'EDU*2+DEX*2',
          skills: ['艺术与手工艺', '心理学', '说服', '侦察', '历史', '魅惑', '母语'],
        },
        {
          id: 'hunter', name: '猎人',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['格斗', '追踪', '自然学', '侦察', '潜行', '生存', '急救', '步枪/霰弹枪'],
        },
        {
          id: 'occultist', name: '神秘学家',
          skill_points_formula: 'EDU*4',
          skills: ['神秘学', '历史', '图书馆', '克苏鲁神话', '心理学', '考古学', '外语'],
        },
        {
          id: 'soldier', name: '士兵',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['格斗', '急救', '恐吓', '潜行', '侦察', '步枪/霰弹枪', '手枪', '生存'],
        },
        {
          id: 'pilot', name: '飞行员',
          skill_points_formula: 'EDU*2+DEX*2',
          skills: ['驾驶(飞机)', '领航', '机械维修', '电气维修', '侦察', '手枪', '急救'],
        },
        {
          id: 'clergy', name: '神职人员',
          skill_points_formula: 'EDU*4',
          skills: ['历史', '图书馆', '心理学', '说服', '神秘学', '外语', '急救', '母语'],
        },
        {
          id: 'archaeologist', name: '考古学家',
          skill_points_formula: 'EDU*4',
          skills: ['考古学', '历史', '图书馆', '神秘学', '外语', '侦察', '机械维修'],
        },
        {
          id: 'scientist', name: '科学家',
          skill_points_formula: 'EDU*4',
          skills: ['图书馆', '科学(化学)', '科学(生物学)', '科学(物理学)', '侦察', '心理学', '电气维修'],
        },
      ],
      skills: {
        // ── 人际与社交 ──────────────────────────────────────────
        '魅惑':           { label: '魅惑',           base: 15 },
        '说服':           { label: '说服',           base: 10 },
        '恐吓':           { label: '恐吓',           base: 15 },
        '心理学':         { label: '心理学',         base: 10 },
        '精神分析':       { label: '精神分析',       base: 1  },
        '母语':           { label: '母语',           base: 60 },
        '外语':           { label: '外语',           base: 1  },
        // ── 学术知识 ────────────────────────────────────────────
        '会计':           { label: '会计',           base: 5  },
        '人类学':         { label: '人类学',         base: 1  },
        '考古学':         { label: '考古学',         base: 1  },
        '图书馆':         { label: '图书馆',         base: 20 },
        '历史':           { label: '历史',           base: 5  },
        '法律':           { label: '法律',           base: 5  },
        '医学':           { label: '医学',           base: 1  },
        '神秘学':         { label: '神秘学',         base: 5  },
        '自然学':         { label: '自然学',         base: 10 },
        '克苏鲁神话':     { label: '克苏鲁神话',     base: 0  },
        '科学(生物学)':   { label: '科学(生物学)',   base: 1  },
        '科学(化学)':     { label: '科学(化学)',     base: 1  },
        '科学(物理学)':   { label: '科学(物理学)',   base: 1  },
        '科学(药学)':     { label: '科学(药学)',     base: 1  },
        '科学(地质学)':   { label: '科学(地质学)',   base: 1  },
        '艺术与手工艺':   { label: '艺术与手工艺',   base: 5  },
        '估价':           { label: '估价',           base: 5  },
        // ── 感知与侦察 ──────────────────────────────────────────
        '侦察':           { label: '侦察',           base: 25 },
        '听力':           { label: '听力',           base: 20 },
        // ── 技能操作 ────────────────────────────────────────────
        '急救':           { label: '急救',           base: 30 },
        '电气维修':       { label: '电气维修',       base: 10 },
        '机械维修':       { label: '机械维修',       base: 10 },
        '开锁':           { label: '开锁',           base: 1  },
        '计算机':         { label: '计算机',         base: 5  },
        '摄影':           { label: '摄影',           base: 10 },
        '无线电':         { label: '无线电',         base: 1  },
        // ── 体能与运动 ──────────────────────────────────────────
        '攀爬':           { label: '攀爬',           base: 20 },
        '跳跃':           { label: '跳跃',           base: 20 },
        '游泳':           { label: '游泳',           base: 20 },
        '投掷':           { label: '投掷',           base: 20 },
        '潜行':           { label: '潜行',           base: 20 },
        '闪避':           { label: '闪避',           base: 20 },
        '乔装':           { label: '乔装',           base: 5  },
        '追踪':           { label: '追踪',           base: 10 },
        '生存':           { label: '生存',           base: 10 },
        // ── 驾驶与载具 ──────────────────────────────────────────
        '驾驶汽车':       { label: '驾驶汽车',       base: 20 },
        '驾驶(飞机)':     { label: '驾驶(飞机)',     base: 1  },
        '驾驶(船只)':     { label: '驾驶(船只)',     base: 1  },
        '领航':           { label: '领航',           base: 10 },
        '骑术':           { label: '骑术',           base: 5  },
        // ── 战斗 ────────────────────────────────────────────────
        '格斗':           { label: '格斗',           base: 25 },
        '手枪':           { label: '手枪',           base: 20 },
        '步枪/霰弹枪':    { label: '步枪/霰弹枪',    base: 25 },
        '冲锋枪':         { label: '冲锋枪',         base: 15 },
        '近战武器':       { label: '近战武器',       base: 20 },
        '投掷武器':       { label: '投掷武器',       base: 20 },
        '信用评级':       { label: '信用评级',       base: 0  },
      },
    };

    await db('rulesets').insert({
      id: 'coc7-official',
      author_id: 'official_ruleset_lib',
      name: '克苏鲁的呼唤 7th（中文版）',
      version: '1.0.0',
      description: '基于《克苏鲁的呼唤》第七版规则，适合恐怖/悬疑风格跑团。包含8项核心属性、7项派生属性、15个职业、50+技能，以及 /spot /listen /fight /dodge /sc 等快捷指令。',
      status: 'published',
      atoms: JSON.stringify({}),
      connections: JSON.stringify([]),
      commands: JSON.stringify(COC7_COMMANDS),
      character_card_schema: JSON.stringify(COC7_SCHEMA),
      created_at: new Date(),
    });
  }
}

export const rulesetService = new RulesetService();
