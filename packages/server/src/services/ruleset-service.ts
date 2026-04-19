import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { Ruleset, RulesetStatus, ExecuteRequest, ExecuteResponse } from '@trpg/shared';
import { resolveCommands } from '../engine/command-resolver';
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
          return [key, { type: 'static' as const, value: params[key] }];
        }
        return [key, source];
      })
    ),
  }));
  return { ...graph, nodes };
}

export class RulesetService {
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
      character_card_schema: JSON.stringify({}),
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
   * 执行规则集命令
   * 三层解析：规则集自定义命令 → 规则集声明支持命令 → 平台预置命令
   */
  async executeCommand(req: ExecuteRequest): Promise<ExecuteResponse> {
    const ruleset = await this.findById(req.ruleset_id);
    if (!ruleset) throw Object.assign(new Error('Ruleset not found'), { code: 'NOT_FOUND' });

    const commands = resolveCommands(ruleset);
    const commandName = req.command.toLowerCase();
    const commandDef = commands[commandName];
    if (!commandDef) {
      throw Object.assign(
        new Error(`Command '${req.command}' not found in ruleset or platform defaults`),
        { code: 'NOT_FOUND' }
      );
    }

    // 将用户传入的 params 注入图节点
    let graph = injectParamsIntoGraph(commandDef.graph, req.params as Record<string, unknown>);

    // 若图中有 character_skill_reader 节点且提供了 character_id，则注入角色数据
    const needsCharacterData = graph.nodes.some((n) => n.atom_type === 'character_skill_reader');
    if (needsCharacterData && req.context.character_id) {
      const charRow = await db('character_sheets').where({ id: req.context.character_id }).first();
      if (charRow) {
        const characterData = {
          attributes: typeof charRow.attributes === 'string' ? JSON.parse(charRow.attributes) : (charRow.attributes ?? {}),
          skills: typeof charRow.skills === 'string' ? JSON.parse(charRow.skills) : (charRow.skills ?? {}),
          resources: typeof charRow.derived_max === 'string' ? JSON.parse(charRow.derived_max) : (charRow.derived_max ?? {}),
        };
        graph = injectParamsIntoGraph(graph, { character_data: characterData });
      }
    }

    const executor = new GraphExecutor(globalRegistry);
    const result = executor.execute(graph);

    return {
      success: result.success,
      output: result.output,
      logs: result.logs,
      ...(result.error ? { error: result.error } : {}),
    } as ExecuteResponse;
  }
}

export const rulesetService = new RulesetService();
