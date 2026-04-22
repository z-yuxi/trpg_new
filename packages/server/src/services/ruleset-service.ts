import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { Ruleset, RulesetStatus, ExecuteRequest, ExecuteResponse, RulesetVersion, RulesetVersionDiff, ForkResult, MergeResult, MergeConflict } from '@trpg/shared';
import { resolveCommand } from '../engine/command-resolver';
import { GraphExecutor, type GraphDef } from '../engine/executor';
import { globalRegistry } from '../engine/registry';
import { NotFoundError, ForbiddenError, BadRequestError } from '../middleware/error-handler';

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

/** 灏嗗懡浠ゅ弬鏁版敞鍏ュ浘鑺傜偣鐨?static 杈撳叆锛堥敭鍚嶅尮閰嶆椂瑕嗙洊锛?*/
function injectParamsIntoGraph(graph: GraphDef, params: Record<string, unknown>): GraphDef {
  if (!params || Object.keys(params).length === 0) return graph;
  const nodes = graph.nodes.map((node) => ({
    ...node,
    inputs: Object.fromEntries(
      Object.entries(node.inputs).map(([key, source]) => {
        if (source.type === 'static' && key in params) {
          // 灏濊瘯灏嗘暟瀛楀瓧绗︿覆杞崲涓烘暟鍊硷紙濡?threshold="60" 鈫?60锛?
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
  /** 鑾峰彇褰撳墠鐢ㄦ埛鐨勬墍鏈夎鍒欓泦锛堝惈鑽夌锛?*/
  async listMine(userId: string): Promise<Ruleset[]> {
    const rows = await db('rulesets')
      .where({ author_id: userId })
      .orderBy('created_at', 'desc');
    return (rows as Record<string, unknown>[]).map(rowToRuleset);
  }

  /** 鑾峰彇瑙勫垯闆嗗垪琛紙鍒嗛〉 + 绛涢€夛級 */
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

  /** 鎸?ID 鑾峰彇瑙勫垯闆?*/
  async findById(id: string): Promise<Ruleset | null> {
    const row = await db('rulesets').where({ id }).first();
    if (!row) return null;
    return rowToRuleset(row as Record<string, unknown>);
  }

  /** 鍒涘缓瑙勫垯闆?*/
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

  /** 鏇存柊瑙勫垯闆嗭紙浠呬綔鑰呭彲鎿嶄綔锛?*/
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
    if (!ruleset) throw new NotFoundError('Ruleset', id);
    if (ruleset.author_id !== userId) throw new ForbiddenError();
    if (ruleset.status === 'published') throw new BadRequestError('Cannot edit a published ruleset');

    // 鏍￠獙鑷畾涔夊懡浠ょ殑 graph_json
    if (data.commands) {
      const cmds = (data.commands as any).custom_commands;
      if (Array.isArray(cmds)) {
        for (const cmd of cmds) {
          if (!cmd.graph_json && !cmd.graph) continue;
          const graph = cmd.graph ?? (typeof cmd.graph_json === 'string' ? (() => {
            try { return JSON.parse(cmd.graph_json); } catch {
              throw new BadRequestError(`Custom command '${cmd.trigger ?? cmd.name}': invalid graph_json`);
            }
          })() : cmd.graph_json);
          if (graph && Array.isArray(graph.nodes)) {
            for (const node of graph.nodes) {
              if (!node.node_id || !node.atom_type) {
                throw new BadRequestError('Custom command graph: node missing node_id or atom_type');
              }
              if (!globalRegistry.has(node.atom_type)) {
                throw new BadRequestError(`Custom command graph: unknown atom_type '${node.atom_type}'`);
              }
            }
          }
        }
      }
    }

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

  /** 鍙戝竷瑙勫垯闆嗭紙draft 鈫?published锛屼粎浣滆€咃級 */
  async publish(id: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(id);
    if (!ruleset) throw new NotFoundError('Ruleset', id);
    if (ruleset.author_id !== userId) throw new ForbiddenError();
    if (ruleset.status === 'published') throw new BadRequestError('Already published');

    await db('rulesets').where({ id }).update({ status: 'published' });
    return (await this.findById(id))!;
  }

  /**
   * 鎵ц瑙勫垯闆嗗懡浠わ紙涓夊眰瑙ｆ瀽锛氳嚜瀹氫箟 鈫?瑙勫垯闆嗛缃?鈫?閫氱敤锛夈€?
   * @param ruleset_id  璺緞鍙傛暟涓殑瑙勫垯闆?ID
   * @param body        璇锋眰浣擄紙鏂版牸寮忥紝涓嶅惈 ruleset_id锛?
   */
  async executeCommand(ruleset_id: string, body: ExecuteRequest): Promise<ExecuteResponse> {
    const ruleset = await this.findById(ruleset_id);
    if (!ruleset) throw new NotFoundError('Ruleset', ruleset_id);

    // 涓夊眰瑙ｆ瀽
    const resolved = resolveCommand(body.command, ruleset);
    if (!resolved) {
      throw new NotFoundError('Command', body.command);
    }

    // 灏嗚В鏋愬弬鏁?+ body.params 鍚堝苟娉ㄥ叆鍥?
    const mergedParams: Record<string, unknown> = {
      ...resolved.parsedParams,
      ...(body.params ?? {}),
    };
    let graph = injectParamsIntoGraph(resolved.graph, mergedParams);

    // 娉ㄥ叆瑙掕壊鏁版嵁锛堜紭鍏?mock_context锛屽叾娆＄湡瀹炶鑹诧級
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

    // 浠庢棩蹇椾腑鎻愬彇楠板瓙鎶曟幏淇℃伅
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

    // 鐢熸垚鍙缁撴灉鎻忚堪
    const resultText = result.success
      ? (typeof result.output === 'object' && result.output !== null
        ? (() => {
          const o = result.output as Record<string, unknown>;
          if ('passed' in o) return (o['passed'] as boolean) ? '鎴愬姛' : '澶辫触';
          if ('total' in o) return `缁撴灉锛${o['total']}`;
          if ('value' in o) return `缁撴灉锛${o['value']}`;
          return JSON.stringify(result.output);
        })()
        : String(result.output))
      : (result.error ?? '鎵ц澶辫触');

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

  // 鈹€鈹€ 鐗堟湰蹇収 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /** 鍒涘缓鐗堟湰蹇収锛堜繚瀛樻椂璋冪敤锛?*/
  async saveVersion(rulesetId: string, changelog: string, userId: string): Promise<RulesetVersion> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw new NotFoundError('Ruleset', rulesetId);
    if (ruleset.author_id !== userId) throw new ForbiddenError();

    // 璁＄畻鐗堟湰鍙凤紙鍩轰簬鐜版湁鐗堟湰鏁伴噺锛?
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
    // 鏇存柊 latest_version_id
    await db('rulesets').where({ id: rulesetId }).update({ latest_version_id: id });
    return (await this.getVersion(id))!;
  }

  /** 鑾峰彇鐗堟湰鍘嗗彶 */
  async listVersions(rulesetId: string): Promise<RulesetVersion[]> {
    const rows = await db('ruleset_versions')
      .where({ ruleset_id: rulesetId })
      .orderBy('created_at', 'desc');
    return (rows as Record<string, unknown>[]).map(this._rowToVersion);
  }

  /** 鑾峰彇鎸囧畾鐗堟湰 */
  async getVersion(versionId: string): Promise<RulesetVersion | null> {
    const row = await db('ruleset_versions').where({ id: versionId }).first();
    if (!row) return null;
    return this._rowToVersion(row as Record<string, unknown>);
  }

  /** 鍥炴粴鍒版寚瀹氱増鏈?*/
  async rollbackToVersion(rulesetId: string, versionId: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw new NotFoundError('Ruleset', rulesetId);
    if (ruleset.author_id !== userId) throw new ForbiddenError();

    const version = await this.getVersion(versionId);
    if (!version || version.ruleset_id !== rulesetId) {
      throw new NotFoundError('Version', versionId);
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

  /** 瀵规瘮涓や釜鐗堟湰锛堣妭鐐广€佽繛鎺ャ€佸懡浠や笁缁?diff锛?*/
  async compareVersions(versionIdA: string, versionIdB: string): Promise<RulesetVersionDiff> {
    const [vA, vB] = await Promise.all([this.getVersion(versionIdA), this.getVersion(versionIdB)]);
    if (!vA || !vB) throw new NotFoundError('Version', versionIdA);

    const snapshotA = vA.snapshot;
    const snapshotB = vB.snapshot;
    const atomsA: any[] = (snapshotA.atoms as any[]) ?? [];
    const atomsB: any[] = (snapshotB.atoms as any[]) ?? [];

    // 鈹€鈹€ 鑺傜偣 diff 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    const mapA = new Map(atomsA.map((n: any) => [n.node_id as string, n]));
    const mapB = new Map(atomsB.map((n: any) => [n.node_id as string, n]));

    const nodesAdded: RulesetVersionDiff['nodes']['added'] = [];
    const nodesRemoved: RulesetVersionDiff['nodes']['removed'] = [];
    const nodesModified: RulesetVersionDiff['nodes']['modified'] = [];

    for (const [id, nodeB] of mapB) {
      if (!mapA.has(id)) {
        nodesAdded.push({ node_id: id, atom_type: nodeB.atom_type });
      } else {
        const nodeA = mapA.get(id)!;
        if (JSON.stringify(nodeA) !== JSON.stringify(nodeB)) {
          const changedFields: string[] = [];
          if (nodeA.atom_type !== nodeB.atom_type) changedFields.push('atom_type');
          const allInputKeys = new Set([...Object.keys(nodeA.inputs ?? {}), ...Object.keys(nodeB.inputs ?? {})]);
          for (const k of allInputKeys) {
            if (JSON.stringify(nodeA.inputs?.[k]) !== JSON.stringify(nodeB.inputs?.[k])) {
              changedFields.push(`inputs.${k}`);
            }
          }
          nodesModified.push({ node_id: id, atom_type: nodeB.atom_type, changed_fields: changedFields });
        }
      }
    }
    for (const [id, nodeA] of mapA) {
      if (!mapB.has(id)) {
        nodesRemoved.push({ node_id: id, atom_type: nodeA.atom_type });
      }
    }

    // 鈹€鈹€ 杩炴帴 diff 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    const connKey = (c: any) => `${c.source}:${c.sourceHandle ?? ''}->${c.target}:${c.targetHandle ?? ''}`;
    const connsA: any[] = (snapshotA as any).connections ?? [];
    const connsB: any[] = (snapshotB as any).connections ?? [];
    const connSetA = new Map(connsA.map((c: any) => [connKey(c), c]));
    const connSetB = new Map(connsB.map((c: any) => [connKey(c), c]));

    const connsAdded: RulesetVersionDiff['connections']['added'] = [];
    const connsRemoved: RulesetVersionDiff['connections']['removed'] = [];
    for (const [key, c] of connSetB) {
      if (!connSetA.has(key)) connsAdded.push({ source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle });
    }
    for (const [key, c] of connSetA) {
      if (!connSetB.has(key)) connsRemoved.push({ source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle });
    }

    // 鈹€鈹€ 鍛戒护 diff 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    const cmdsA: string[] = (snapshotA as any).commands?.supported_commands ?? [];
    const cmdsB: string[] = (snapshotB as any).commands?.supported_commands ?? [];
    const cmdSetA = new Set(cmdsA);
    const cmdSetB = new Set(cmdsB);
    const cmdsAdded = cmdsB.filter((c) => !cmdSetA.has(c));
    const cmdsRemoved = cmdsA.filter((c) => !cmdSetB.has(c));
    const cmdsModified: string[] = [];

    // 妫€鏌ヨ嚜瀹氫箟鍛戒护閰嶇疆鏄惁鍙樺寲
    const customA: any[] = (snapshotA as any).commands?.custom_commands ?? [];
    const customB: any[] = (snapshotB as any).commands?.custom_commands ?? [];
    const customMapA = new Map(customA.map((c: any) => [c.name, c]));
    const customMapB = new Map(customB.map((c: any) => [c.name, c]));
    for (const [name, cmd] of customMapB) {
      if (customMapA.has(name) && JSON.stringify(customMapA.get(name)) !== JSON.stringify(cmd)) {
        cmdsModified.push(name);
      }
    }

    return {
      nodes: { added: nodesAdded, removed: nodesRemoved, modified: nodesModified },
      connections: { added: connsAdded, removed: connsRemoved },
      commands: { added: cmdsAdded, removed: cmdsRemoved, modified: cmdsModified },
      // 鏃у瓧娈靛吋瀹?
      added_nodes: nodesAdded.map((n) => n.node_id),
      removed_nodes: nodesRemoved.map((n) => n.node_id),
      modified_nodes: nodesModified.map((n) => n.node_id),
      added_connections: connsAdded.map((c) => `${c.source}->${c.target}`),
      removed_connections: connsRemoved.map((c) => `${c.source}->${c.target}`),
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

  // 鈹€鈹€ 鍙戝竷鐘舵€佹満 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /** draft 鈫?reviewing锛堝悓鏃惰嚜鍔?approve 鈫?published锛孷1.0 鏃犱汉宸ュ鏍革級 */
  async submitForReview(id: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(id);
    if (!ruleset) throw new NotFoundError('Ruleset', id);
    if (ruleset.author_id !== userId) throw new ForbiddenError();
    if (ruleset.status !== 'draft') throw new BadRequestError(`Cannot submit from status '${ruleset.status}'`);

    // V1.0 鑷姩瀹℃牳閫氳繃
    await db('rulesets').where({ id }).update({ status: 'published' });
    // 鑷姩鍒涘缓鐗堟湰蹇収
    await this.saveVersion(id, '鍙戝竷瀹℃牳蹇収', userId).catch(() => { /* non-critical */ });
    return (await this.findById(id))!;
  }

  /** published 鈫?deprecated */
  async deprecate(id: string, userId: string): Promise<Ruleset> {
    const ruleset = await this.findById(id);
    if (!ruleset) throw new NotFoundError('Ruleset', id);
    if (ruleset.author_id !== userId) throw new ForbiddenError();
    if (ruleset.status !== 'published') throw new BadRequestError('Can only deprecate published rulesets');
    await db('rulesets').where({ id }).update({ status: 'deprecated' });
    return (await this.findById(id))!;
  }

  // 鈹€鈹€ Fork 涓庣户鎵?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

  /** Fork 涓€涓鍒欓泦 */
  async forkRuleset(sourceId: string, userId: string): Promise<ForkResult> {
    const source = await this.findById(sourceId);
    if (!source) throw new NotFoundError('Ruleset', sourceId);
    if (source.status !== 'published') throw new BadRequestError('Can only fork published rulesets');

    const currentVersion = (source as any).lock_version ?? 0;
    const newId = generateId();
    await db('rulesets').insert({
      id: newId,
      author_id: userId,
      name: `${source.name} (Fork)`,
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

    // 涔愯閿佹洿鏂?fork_count
    const affected = await db('rulesets')
      .where({ id: sourceId, lock_version: currentVersion })
      .update({ fork_count: db.raw('fork_count + 1'), lock_version: currentVersion + 1 });

    if (affected === 0) {
      // 骞跺彂鍐茬獊锛氶噸鏂拌鍙栨渶鏂?fork_count
      const updated = await this.findById(sourceId);
      return { new_ruleset: (await this.findById(newId))!, source_fork_count: (updated as any)?.fork_count ?? 0 };
    }

    return {
      new_ruleset: (await this.findById(newId))!,
      source_fork_count: (source as any).fork_count + 1,
    };
  }

  /** 浠庝笂娓?parent 鍚堝苟鍙樻洿 */
  async mergeFromParent(rulesetId: string, userId: string): Promise<MergeResult> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw new NotFoundError('Ruleset', rulesetId);
    if (ruleset.author_id !== userId) throw new ForbiddenError();
    const parentId = (ruleset as any).parent_id ?? ruleset.parent_ruleset_id;
    if (!parentId) throw new BadRequestError('No parent ruleset');

    const parent = await this.findById(parentId);
    if (!parent) throw new NotFoundError('Ruleset', parentId);

    const ourAtoms = (ruleset.atoms as any[]) ?? [];
    const theirAtoms = (parent.atoms as any[]) ?? [];
    const ourConns = (ruleset.connections as any[]) ?? [];
    const theirConns = (parent.connections as any[]) ?? [];

    const ourMap = new Map(ourAtoms.map((n: any) => [n.node_id, n]));
    const theirMap = new Map(theirAtoms.map((n: any) => [n.node_id, n]));

    const merged: any[] = [];
    const conflicts: MergeConflict[] = [];

    // 澶勭悊 parent 鐨勬墍鏈夎妭鐐?
    for (const [id, theirNode] of theirMap) {
      if (ourMap.has(id)) {
        const ourNode = ourMap.get(id)!;
        if (JSON.stringify(ourNode) === JSON.stringify(theirNode)) {
          merged.push(ourNode);
        } else {
          // 鍙屾柟閮戒慨鏀逛簡锛屼骇鐢熷啿绐?
          conflicts.push({ node_id: id, type: 'modified_both', our_node: ourNode, their_node: theirNode });
          merged.push(ourNode); // 涓存椂淇濈暀鏈湴锛岀瓑鐢ㄦ埛 resolve
        }
      } else {
        // parent 鏂板鐨勮妭鐐癸紝鑷姩鍚堝苟
        merged.push(theirNode);
      }
    }
    // 鏈湴鐙湁鐨勮妭鐐癸紙鏈湴鏂板锛?
    for (const [id, ourNode] of ourMap) {
      if (!theirMap.has(id)) {
        merged.push(ourNode);
      }
    }

    // 鈹€鈹€ 杩炴帴鍚堝苟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
    const connKey = (c: any) => `${c.source}:${c.sourceHandle ?? ''}->${c.target}:${c.targetHandle ?? ''}`;
    const ourConnMap = new Map(ourConns.map((c: any) => [connKey(c), c]));
    const theirConnMap = new Map(theirConns.map((c: any) => [connKey(c), c]));

    const mergedConns: any[] = [];
    for (const [key, theirConn] of theirConnMap) {
      if (ourConnMap.has(key)) {
        mergedConns.push(ourConnMap.get(key)!);
      } else {
        // parent 鏂板鐨勮繛鎺ワ紝鑷姩鍚堝苟
        mergedConns.push(theirConn);
      }
    }
    for (const [key, ourConn] of ourConnMap) {
      if (!theirConnMap.has(key)) {
        // 鏈湴鐙湁鐨勮繛鎺?
        mergedConns.push(ourConn);
      }
    }

    if (conflicts.length > 0) {
      return { status: 'conflicts', merged_graph: null, conflicts };
    }

    // 鏃犲啿绐侊紝鐩存帴淇濆瓨鍚堝苟缁撴灉
    await db('rulesets').where({ id: rulesetId }).update({
      atoms: JSON.stringify(merged),
      connections: JSON.stringify(mergedConns),
    });

    return {
      status: 'clean',
      merged_graph: { atoms: merged, connections: mergedConns },
      conflicts: [],
    };
  }

  /** 瑙ｅ喅鍚堝苟鍐茬獊锛堢敤鎴烽€夋嫨姣忎釜鍐茬獊鑺傜偣淇濈暀鍝柟锛?*/
  async resolveMerge(
    rulesetId: string,
    userId: string,
    resolutions: Array<{ node_id: string; keep: 'ours' | 'theirs' }>,
  ): Promise<Ruleset> {
    const ruleset = await this.findById(rulesetId);
    if (!ruleset) throw new NotFoundError('Ruleset', rulesetId);
    if (ruleset.author_id !== userId) throw new ForbiddenError();
    const parentId = (ruleset as any).parent_id ?? ruleset.parent_ruleset_id;
    if (!parentId) throw new BadRequestError('No parent ruleset');

    const parent = await this.findById(parentId);
    if (!parent) throw new NotFoundError('Ruleset', parentId);

    const ourAtoms = (ruleset.atoms as any[]) ?? [];
    const theirAtoms = (parent.atoms as any[]) ?? [];
    const ourConns = (ruleset.connections as any[]) ?? [];
    const theirConns = (parent.connections as any[]) ?? [];

    const ourMap = new Map(ourAtoms.map((n: any) => [n.node_id, n]));
    const theirMap = new Map(theirAtoms.map((n: any) => [n.node_id, n]));
    const resolutionMap = new Map(resolutions.map((r) => [r.node_id, r.keep]));

    const merged: any[] = [];
    const allIds = new Set([...ourMap.keys(), ...theirMap.keys()]);

    for (const id of allIds) {
      const ourNode = ourMap.get(id);
      const theirNode = theirMap.get(id);
      if (ourNode && theirNode) {
        // 鍐茬獊鑺傜偣锛屾寜 resolution 鍐冲畾
        const keep = resolutionMap.get(id) ?? 'ours';
        merged.push(keep === 'theirs' ? theirNode : ourNode);
      } else if (ourNode) {
        merged.push(ourNode);
      } else if (theirNode) {
        merged.push(theirNode);
      }
    }

    // 杩炴帴鍚堝苟锛堝悓 mergeFromParent 鏃犲啿绐侀€昏緫锛?
    const connKey = (c: any) => `${c.source}:${c.sourceHandle ?? ''}->${c.target}:${c.targetHandle ?? ''}`;
    const ourConnMap = new Map(ourConns.map((c: any) => [connKey(c), c]));
    const theirConnMap = new Map(theirConns.map((c: any) => [connKey(c), c]));

    const mergedConns: any[] = [];
    for (const [key, theirConn] of theirConnMap) {
      mergedConns.push(ourConnMap.has(key) ? ourConnMap.get(key)! : theirConn);
    }
    for (const [key, ourConn] of ourConnMap) {
      if (!theirConnMap.has(key)) mergedConns.push(ourConn);
    }

    await db('rulesets').where({ id: rulesetId }).update({
      atoms: JSON.stringify(merged),
      connections: JSON.stringify(mergedConns),
    });

    return (await this.findById(rulesetId))!;
  }

  /** 棣栨鍚姩鏃惰嚜鍔ㄦ彃鍏ヤ竴浠藉畬鏁寸殑 CoC 7th 涓枃瑙勫垯鍖咃紙鑻ユ棤浠讳綍宸插彂甯冭鍒欏寘锛?*/
  async seedCoc7IfEmpty(): Promise<void> {
    const existing = await db('rulesets').where({ status: 'published' }).first();
    if (existing) return;

    // 鈹€鈹€ 蹇嵎鎶€鑳芥瀹氬浘锛?d100 鈮?鎸囧畾鎶€鑳藉€硷級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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

    // 鈹€鈹€ 蹇嵎灞炴€ф瀹氬浘锛?d100 鈮?鎸囧畾灞炴€у€硷級鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
      // 鈹€鈹€ 甯哥敤鎶€鑳藉揩鎹烽敭锛堝搴旀寚浠?md涓殑 ra鎶€鑳藉悕 鏍煎紡锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      spot:     { description: '渚﹀療锛?spot锛?',        graph: skillCheckGraph('渚﹀療') },
      listen:   { description: '鍚姏锛?listen锛?',       graph: skillCheckGraph('鍚姏') },
      lib:      { description: '鍥句功棣嗭紙/lib锛?',        graph: skillCheckGraph('鍥句功棣?') },
      hide:     { description: '娼滆锛?hide锛?',         graph: skillCheckGraph('娼滆') },
      psy:      { description: '蹇冪悊瀛︼紙/psy锛?',        graph: skillCheckGraph('蹇冪悊瀛?') },
      dodge:    { description: '闂伩锛?dodge锛?',        graph: skillCheckGraph('闂伩') },
      fight:    { description: '鏍兼枟锛?fight锛?',        graph: skillCheckGraph('鏍兼枟') },
      first:    { description: '鎬ユ晳锛?first锛?',        graph: skillCheckGraph('鎬ユ晳') },
      charm:    { description: '榄呮儜锛?charm锛?',        graph: skillCheckGraph('榄呮儜') },
      persuade: { description: '璇存湇锛?persuade锛?',     graph: skillCheckGraph('璇存湇') },
      intim:    { description: '鎭愬悡锛?intim锛?',        graph: skillCheckGraph('鎭愬悡') },
      swim:     { description: '娓告吵锛?swim锛?',         graph: skillCheckGraph('娓告吵') },
      climb:    { description: '鏀€鐖紙/climb锛?',        graph: skillCheckGraph('鏀€鐖?') },
      jump:     { description: '璺宠穬锛?jump锛?',         graph: skillCheckGraph('璺宠穬') },
      throw:    { description: '鎶曟幏锛?throw锛?',        graph: skillCheckGraph('鎶曟幏') },
      track:    { description: '杩借釜锛?track锛?',        graph: skillCheckGraph('杩借釜') },
      occult:   { description: '绁炵瀛︼紙/occult锛?',     graph: skillCheckGraph('绁炵瀛?') },
      myth:     { description: '鍏嬭嫃椴佺璇濓紙/myth锛?',   graph: skillCheckGraph('鍏嬭嫃椴佺璇?') },
      history:  { description: '鍘嗗彶锛?history锛?',      graph: skillCheckGraph('鍘嗗彶') },
      nature:   { description: '鑷劧瀛︼紙/nature锛?',     graph: skillCheckGraph('鑷劧瀛?') },
      medicine: { description: '鍖诲锛?medicine锛?',     graph: skillCheckGraph('鍖诲') },
      science:  { description: '绉戝锛?science锛?',      graph: skillCheckGraph('绉戝(鐢熺墿瀛?') },
      law:      { description: '娉曞緥锛?law锛?',          graph: skillCheckGraph('娉曞緥') },
      account:  { description: '浼氳锛?account锛?',      graph: skillCheckGraph('浼氳') },
      craft:    { description: '鑹烘湳涓庢墜宸ヨ壓锛?craft锛?', graph: skillCheckGraph('鑹烘湳涓庢墜宸ヨ壓') },
      disguise: { description: '涔旇锛?disguise锛?',     graph: skillCheckGraph('涔旇') },
      lockpick: { description: '寮€閿侊紙/lockpick锛?',     graph: skillCheckGraph('寮€閿?') },
      elec:     { description: '鐢垫皵缁翠慨锛?elec锛?',     graph: skillCheckGraph('鐢垫皵缁翠慨') },
      mech:     { description: '鏈烘缁翠慨锛?mech锛?',     graph: skillCheckGraph('鏈烘缁翠慨') },
      photo:    { description: '鎽勫奖锛?photo锛?',        graph: skillCheckGraph('鎽勫奖') },
      drive:    { description: '椹鹃┒姹借溅锛?drive锛?',    graph: skillCheckGraph('椹鹃┒姹借溅') },
      ride:     { description: '楠戞湳锛?ride锛?',         graph: skillCheckGraph('楠戞湳') },
      pistol:   { description: '鎵嬫灙锛?pistol锛?',       graph: skillCheckGraph('鎵嬫灙') },
      rifle:    { description: '姝ユ灙/闇板脊鏋紙/rifle锛?', graph: skillCheckGraph('姝ユ灙/闇板脊鏋?') },
      melee:    { description: '杩戞垬姝﹀櫒锛?melee锛?',    graph: skillCheckGraph('杩戞垬姝﹀櫒') },
      survival: { description: '鐢熷瓨锛?survival锛?',     graph: skillCheckGraph('鐢熷瓨') },
      credit:   { description: '淇＄敤璇勭骇锛?credit锛?',   graph: skillCheckGraph('淇＄敤璇勭骇') },
      // 鈹€鈹€ 灞炴€у揩鎹烽敭锛堝搴旀寚浠?md涓?ra灞炴€у悕 鏍煎紡锛夆攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
      str:      { description: '鍔涢噺妫€瀹氾紙/str锛?',    graph: attrCheckGraph('STR') },
      dex:      { description: '鏁忔嵎妫€瀹氾紙/dex锛?',    graph: attrCheckGraph('DEX') },
      pow:      { description: '鎰忓織妫€瀹氾紙/pow锛?',    graph: attrCheckGraph('POW') },
      con:      { description: '浣撹川妫€瀹氾紙/con锛?',    graph: attrCheckGraph('CON') },
      app:      { description: '澶栬矊妫€瀹氾紙/app锛?',    graph: attrCheckGraph('APP') },
      int:      { description: '鏅哄姏妫€瀹氾紙/int锛?',    graph: attrCheckGraph('INT') },
      edu:      { description: '鏁欒偛妫€瀹氾紙/edu锛?',    graph: attrCheckGraph('EDU') },
      luck:     { description: '骞歌繍妫€瀹氾紙/luck = POW*5锛?', graph: attrCheckGraph('POW') },
    };

    const COC7_SCHEMA = {
      attributes: {
        STR: { label: '鍔涢噺 STR', roll_formula: '3d6*5',    min: 15, max: 90 },
        DEX: { label: '鏁忔嵎 DEX', roll_formula: '3d6*5',    min: 15, max: 90 },
        POW: { label: '鎰忓織 POW', roll_formula: '3d6*5',    min: 15, max: 90 },
        CON: { label: '浣撹川 CON', roll_formula: '3d6*5',    min: 15, max: 90 },
        APP: { label: '澶栬矊 APP', roll_formula: '3d6*5',    min: 15, max: 90 },
        SIZ: { label: '浣撳瀷 SIZ', roll_formula: '2d6*5+30', min: 40, max: 90 },
        INT: { label: '鏅哄姏 INT', roll_formula: '2d6*5+30', min: 40, max: 90 },
        EDU: { label: '鏁欒偛 EDU', roll_formula: '2d6*5+30', min: 40, max: 99 },
      },
      derived_formulas: {
        HP:    { formula: 'floor((CON + SIZ) / 10)', label: '鐢熷懡鍊?HP',   min: 1 },
        MP:    { formula: 'floor(POW / 5)',           label: '榄旀硶鍊?MP',   min: 0 },
        SAN:   { formula: 'POW',                      label: '鐞嗘櫤鍊?SAN',  min: 0, max: 99 },
        LK:    { formula: 'POW * 5',                  label: '骞歌繍鍊?LK',   min: 1, max: 99 },
        MOV:   { formula: '8',                        label: '绉诲姩閫熷害 MOV' },
        DB:    { formula: '0',                        label: '浼ゅ鍔犲€?DB'  },
        Build: { formula: '0',                        label: '浣撴牸 Build'   },
      },
      occupations: [
        {
          id: 'doctor', name: '鍖荤敓',
          skill_points_formula: 'EDU*4',
          skills: ['鎬ユ晳', '蹇冪悊瀛?', '鍖诲', '璇存湇', '渚﹀療', '鍥句功棣?', '绉戝(鐢熺墿瀛?', '绉戝(鑽)'],
        },
        {
          id: 'investigator', name: '绉佸渚︽帰',
          skill_points_formula: 'EDU*2+INT*2',
          skills: ['鏍兼枟', '蹇冪悊瀛?', '渚﹀療', '鍥句功棣?', '璇存湇', '娼滆', '涔旇', '寮€閿?'],
        },
        {
          id: 'journalist', name: '璁拌€?',
          skill_points_formula: 'EDU*4',
          skills: ['鍘嗗彶', '鍥句功棣?', '蹇冪悊瀛?', '璇存湇', '渚﹀療', '鎽勫奖', '璁＄畻鏈?', '姣嶈'],
        },
        {
          id: 'professor', name: '鏁欐巿',
          skill_points_formula: 'EDU*4',
          skills: ['鍥句功棣?', '鍘嗗彶', '蹇冪悊瀛?', '璇存湇', '渚﹀療', '鑰冨彜瀛?', '绁炵瀛?', '澶栬'],
        },
        {
          id: 'police', name: '璀﹀療',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['鏍兼枟', '鎬ユ晳', '蹇冪悊瀛?', '渚﹀療', '璇存湇', '椹鹃┒姹借溅', '鎭愬悡', '鎵嬫灙'],
        },
        {
          id: 'nurse', name: '鎶ゅ＋',
          skill_points_formula: 'EDU*4',
          skills: ['鎬ユ晳', '蹇冪悊瀛?', '鍖诲', '渚﹀療', '璇存湇', '绉戝(鐢熺墿瀛?', '绉戝(鑽)'],
        },
        {
          id: 'criminal', name: '姝瑰緬',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['鏍兼枟', '渚﹀療', '娼滆', '椹鹃┒姹借溅', '鎭愬悡', '寮€閿?', '榄呮儜', '鎵嬫灙'],
        },
        {
          id: 'artist', name: '鑹烘湳瀹?',
          skill_points_formula: 'EDU*2+DEX*2',
          skills: ['鑹烘湳涓庢墜宸ヨ壓', '蹇冪悊瀛?', '璇存湇', '渚﹀療', '鍘嗗彶', '榄呮儜', '姣嶈'],
        },
        {
          id: 'hunter', name: '鐚庝汉',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['鏍兼枟', '杩借釜', '鑷劧瀛?', '渚﹀療', '娼滆', '鐢熷瓨', '鎬ユ晳', '姝ユ灙/闇板脊鏋?'],
        },
        {
          id: 'occultist', name: '绁炵瀛﹀',
          skill_points_formula: 'EDU*4',
          skills: ['绁炵瀛?', '鍘嗗彶', '鍥句功棣?', '鍏嬭嫃椴佺璇?', '蹇冪悊瀛?', '鑰冨彜瀛?', '澶栬'],
        },
        {
          id: 'soldier', name: '澹叺',
          skill_points_formula: 'EDU*2+STR*2',
          skills: ['鏍兼枟', '鎬ユ晳', '鎭愬悡', '娼滆', '渚﹀療', '姝ユ灙/闇板脊鏋?', '鎵嬫灙', '鐢熷瓨'],
        },
        {
          id: 'pilot', name: '椋炶鍛?',
          skill_points_formula: 'EDU*2+DEX*2',
          skills: ['椹鹃┒(椋炴満)', '棰嗚埅', '鏈烘缁翠慨', '鐢垫皵缁翠慨', '渚﹀療', '鎵嬫灙', '鎬ユ晳'],
        },
        {
          id: 'clergy', name: '绁炶亴浜哄憳',
          skill_points_formula: 'EDU*4',
          skills: ['鍘嗗彶', '鍥句功棣?', '蹇冪悊瀛?', '璇存湇', '绁炵瀛?', '澶栬', '鎬ユ晳', '姣嶈'],
        },
        {
          id: 'archaeologist', name: '鑰冨彜瀛﹀',
          skill_points_formula: 'EDU*4',
          skills: ['鑰冨彜瀛?', '鍘嗗彶', '鍥句功棣?', '绁炵瀛?', '澶栬', '渚﹀療', '鏈烘缁翠慨'],
        },
        {
          id: 'scientist', name: '绉戝瀹?',
          skill_points_formula: 'EDU*4',
          skills: ['鍥句功棣?', '绉戝(鍖栧)', '绉戝(鐢熺墿瀛?', '绉戝(鐗╃悊瀛?', '渚﹀療', '蹇冪悊瀛?', '鐢垫皵缁翠慨'],
        },
      ],
      skills: {
        // 鈹€鈹€ 浜洪檯涓庣ぞ浜?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
        '榄呮儜':           { label: '榄呮儜',           base: 15 },
        '璇存湇':           { label: '璇存湇',           base: 10 },
        '鎭愬悡':           { label: '鎭愬悡',           base: 15 },
        '蹇冪悊瀛?':         { label: '蹇冪悊瀛?',         base: 10 },
        '绮剧鍒嗘瀽':       { label: '绮剧鍒嗘瀽',       base: 1  },
        '姣嶈':           { label: '姣嶈',           base: 60 },
        '澶栬':           { label: '澶栬',           base: 1  },
        // 鈹€鈹€ 瀛︽湳鐭ヨ瘑 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
        '浼氳':           { label: '浼氳',           base: 5  },
        '浜虹被瀛?':         { label: '浜虹被瀛?',         base: 1  },
        '鑰冨彜瀛?':         { label: '鑰冨彜瀛?',         base: 1  },
        '鍥句功棣?':         { label: '鍥句功棣?',         base: 20 },
        '鍘嗗彶':           { label: '鍘嗗彶',           base: 5  },
        '娉曞緥':           { label: '娉曞緥',           base: 5  },
        '鍖诲':           { label: '鍖诲',           base: 1  },
        '绁炵瀛?':         { label: '绁炵瀛?',         base: 5  },
        '鑷劧瀛?':         { label: '鑷劧瀛?',         base: 10 },
        '鍏嬭嫃椴佺璇?':     { label: '鍏嬭嫃椴佺璇?',     base: 0  },
        '绉戝(鐢熺墿瀛?':   { label: '绉戝(鐢熺墿瀛?',   base: 1  },
        '绉戝(鍖栧)':     { label: '绉戝(鍖栧)',     base: 1  },
        '绉戝(鐗╃悊瀛?':   { label: '绉戝(鐗╃悊瀛?',   base: 1  },
        '绉戝(鑽)':     { label: '绉戝(鑽)',     base: 1  },
        '绉戝(鍦拌川瀛?':   { label: '绉戝(鍦拌川瀛?',   base: 1  },
        '鑹烘湳涓庢墜宸ヨ壓':   { label: '鑹烘湳涓庢墜宸ヨ壓',   base: 5  },
        '浼颁环':           { label: '浼颁环',           base: 5  },
        // 鈹€鈹€ 鎰熺煡涓庝睛瀵?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
        '渚﹀療':           { label: '渚﹀療',           base: 25 },
        '鍚姏':           { label: '鍚姏',           base: 20 },
        // 鈹€鈹€ 鎶€鑳芥搷浣?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
        '鎬ユ晳':           { label: '鎬ユ晳',           base: 30 },
        '鐢垫皵缁翠慨':       { label: '鐢垫皵缁翠慨',       base: 10 },
        '鏈烘缁翠慨':       { label: '鏈烘缁翠慨',       base: 10 },
        '寮€閿?':           { label: '寮€閿?',           base: 1  },
        '璁＄畻鏈?':         { label: '璁＄畻鏈?',         base: 5  },
        '鎽勫奖':           { label: '鎽勫奖',           base: 10 },
        '鏃犵嚎鐢?':         { label: '鏃犵嚎鐢?',         base: 1  },
        // 鈹€鈹€ 浣撹兘涓庤繍鍔?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
        '鏀€鐖?':           { label: '鏀€鐖?',           base: 20 },
        '璺宠穬':           { label: '璺宠穬',           base: 20 },
        '娓告吵':           { label: '娓告吵',           base: 20 },
        '鎶曟幏':           { label: '鎶曟幏',           base: 20 },
        '娼滆':           { label: '娼滆',           base: 20 },
        '闂伩':           { label: '闂伩',           base: 20 },
        '涔旇':           { label: '涔旇',           base: 5  },
        '杩借釜':           { label: '杩借釜',           base: 10 },
        '鐢熷瓨':           { label: '鐢熷瓨',           base: 10 },
        // 鈹€鈹€ 椹鹃┒涓庤浇鍏?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
        '椹鹃┒姹借溅':       { label: '椹鹃┒姹借溅',       base: 20 },
        '椹鹃┒(椋炴満)':     { label: '椹鹃┒(椋炴満)',     base: 1  },
        '椹鹃┒(鑸瑰彧)':     { label: '椹鹃┒(鑸瑰彧)',     base: 1  },
        '棰嗚埅':           { label: '棰嗚埅',           base: 10 },
        '楠戞湳':           { label: '楠戞湳',           base: 5  },
        // 鈹€鈹€ 鎴樻枟 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
        '鏍兼枟':           { label: '鏍兼枟',           base: 25 },
        '鎵嬫灙':           { label: '鎵嬫灙',           base: 20 },
        '姝ユ灙/闇板脊鏋?':    { label: '姝ユ灙/闇板脊鏋?',    base: 25 },
        '鍐查攱鏋?':         { label: '鍐查攱鏋?',         base: 15 },
        '杩戞垬姝﹀櫒':       { label: '杩戞垬姝﹀櫒',       base: 20 },
        '鎶曟幏姝﹀櫒':       { label: '鎶曟幏姝﹀櫒',       base: 20 },
        '淇＄敤璇勭骇':       { label: '淇＄敤璇勭骇',       base: 0  },
      },
    };

    await db('rulesets').insert({
      id: 'coc7-official',
      author_id: 'official_ruleset_lib',
      name: '鍏嬭嫃椴佺殑鍛煎敜 7th锛堜腑鏂囩増锛?',
      version: '1.0.0',
      description: '鍩轰簬銆婂厠鑻忛瞾鐨勫懠鍞ゃ€嬬涓冪増瑙勫垯锛岄€傚悎鎭愭€?鎮枒椋庢牸璺戝洟銆傚寘鍚?椤规牳蹇冨睘鎬с€?椤规淳鐢熷睘鎬с€?5涓亴涓氥€?0+鎶€鑳斤紝浠ュ強 /spot /listen /fight /dodge /sc 绛夊揩鎹锋寚浠ゃ€?',
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

