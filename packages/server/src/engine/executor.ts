import type { NodeExecutionLog, EngineErrorCode } from '@trpg/shared';
import type { AtomRegistry } from './registry';

/** 输入来源：静态值 或 引用其他节点的输出 */
export type InputSource =
  | { type: 'static'; value: unknown }
  | { type: 'ref'; node_id: string; output_key: string };

/** 节点图中的一个节点定义 */
export interface GraphNodeDef {
  node_id: string;
  atom_type: string;
  inputs: Record<string, InputSource>;
  position?: { x: number; y: number };  // 编辑器用，执行时忽略
}

/** 执行图 */
export interface GraphDef {
  nodes: GraphNodeDef[];
  output_node_id: string;  // 最终输出节点
}

export interface GraphExecuteResult {
  success: boolean;
  output: unknown;
  error?: string;
  /** 失败时指向失败节点 id（§ 十六⑥ graph_execute 阶段使用） */
  failed_node_id?: string;
  /** 结构化错误码（§ 十六.5） */
  error_code?: EngineErrorCode;
  logs: NodeExecutionLog[];
}

export class GraphExecutor {
  constructor(private registry: AtomRegistry) {}

  execute(graph: GraphDef): GraphExecuteResult {
    const logs: NodeExecutionLog[] = [];

    if (!graph.nodes || graph.nodes.length === 0) {
      return { success: false, output: null, error: 'Graph has no nodes', error_code: 'STEP_RESULT_UNAVAILABLE', logs };
    }

    // Topological sort
    let sortedIds: string[];
    try {
      sortedIds = this.topologicalSort(graph.nodes);
    } catch (err) {
      return { success: false, output: null, error: (err as Error).message, error_code: 'DSL_EVAL_ERROR', logs };
    }

    const nodeResults = new Map<string, unknown>();

    for (const nodeId of sortedIds) {
      const nodeDef = graph.nodes.find(n => n.node_id === nodeId)!;

      // Resolve inputs
      const resolvedInputs: Record<string, unknown> = {};
      for (const [key, source] of Object.entries(nodeDef.inputs)) {
        if (source.type === 'static') {
          resolvedInputs[key] = source.value;
        } else if (source.type === 'ref') {
          if (!nodeResults.has(source.node_id)) {
            logs.push({
              node_id: nodeId,
              node_type: nodeDef.atom_type,
              inputs: resolvedInputs,
              output: null,
              duration_ms: 0,
              status: 'failed',
              error_code: 'STEP_RESULT_UNAVAILABLE',
              error_message: `Referenced node '${source.node_id}' has not been executed`,
            });
            return {
              success: false,
              output: null,
              failed_node_id: nodeId,
              error_code: 'STEP_RESULT_UNAVAILABLE',
              error: `Node '${nodeId}': referenced node '${source.node_id}' has not been executed`,
              logs,
            };
          }
          const refResult = nodeResults.get(source.node_id) as Record<string, unknown>;
          resolvedInputs[key] = refResult[source.output_key];
        }
      }

      // Execute atom
      let atom;
      try {
        atom = this.registry.get(nodeDef.atom_type);
      } catch (err) {
        logs.push({
          node_id: nodeId,
          node_type: nodeDef.atom_type,
          inputs: resolvedInputs,
          output: null,
          duration_ms: 0,
          status: 'failed',
          error_code: 'UNKNOWN_RECIPE_TYPE',
          error_message: (err as Error).message,
        });
        return {
          success: false,
          output: null,
          failed_node_id: nodeId,
          error_code: 'UNKNOWN_RECIPE_TYPE',
          error: (err as Error).message,
          logs,
        };
      }

      const start = Date.now();
      let atomOutput;
      try {
        atomOutput = atom.execute(resolvedInputs);
      } catch (err) {
        const duration_ms = Date.now() - start;
        logs.push({
          node_id: nodeId,
          node_type: nodeDef.atom_type,
          inputs: resolvedInputs,
          output: null,
          duration_ms,
          status: 'failed',
          error_code: 'DSL_EVAL_ERROR',
          error_message: (err as Error).message,
        });
        return {
          success: false,
          output: null,
          failed_node_id: nodeId,
          error_code: 'DSL_EVAL_ERROR',
          error: `Node '${nodeId}' (${nodeDef.atom_type}) threw: ${(err as Error).message}`,
          logs,
        };
      }
      const duration_ms = Date.now() - start;

      nodeResults.set(nodeId, atomOutput.result);
      logs.push({
        node_id: nodeId,
        node_type: nodeDef.atom_type,
        inputs: resolvedInputs,
        output: atomOutput.result,
        duration_ms,
        status: 'success',
      });
    }

    const outputNode = graph.nodes.find(n => n.node_id === graph.output_node_id);
    if (!outputNode) {
      return {
        success: false,
        output: null,
        error_code: 'RESULT_COLLECT_FAILED',
        error: `output_node_id '${graph.output_node_id}' not found in graph`,
        logs,
      };
    }

    return {
      success: true,
      output: nodeResults.get(graph.output_node_id),
      logs,
    };
  }

  private topologicalSort(nodes: GraphNodeDef[]): string[] {
    const nodeIds = new Set(nodes.map(n => n.node_id));
    const deps = new Map<string, Set<string>>();

    for (const node of nodes) {
      const nodeDeps = new Set<string>();
      for (const source of Object.values(node.inputs)) {
        if (source.type === 'ref') {
          if (!nodeIds.has(source.node_id)) {
            throw new Error(`Node '${node.node_id}' references unknown node '${source.node_id}'`);
          }
          nodeDeps.add(source.node_id);
        }
      }
      deps.set(node.node_id, nodeDeps);
    }

    // Kahn's algorithm: remaining 记录每个节点还剩哪些依赖未处理
    const sorted: string[] = [];
    const queue: string[] = [];

    const remaining = new Map<string, Set<string>>();
    for (const [id, d] of deps) remaining.set(id, new Set(d));

    for (const [id, d] of remaining) {
      if (d.size === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const [id, d] of remaining) {
        if (d.has(current)) {
          d.delete(current);
          if (d.size === 0) queue.push(id);
        }
      }
    }

    if (sorted.length !== nodes.length) {
      throw new Error('Graph contains a cycle');
    }

    return sorted;
  }
}
