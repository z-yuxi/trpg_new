import { describe, it, expect } from 'vitest';
import { GraphExecutor, type GraphDef } from '../executor';
import { globalRegistry, AtomRegistry } from '../registry';
import { GRAPH_MAX_NODES } from '../sandbox-limits';

describe('GraphExecutor', () => {
  it('应执行简单链式图: dice_roll → threshold_compare → result_collector', () => {
    const executor = new GraphExecutor(globalRegistry);
    const graph: GraphDef = {
      nodes: [
        {
          node_id: 'n1',
          atom_type: 'dice_roll',
          inputs: {
            expression: { type: 'static', value: '1d6' },
            // Fixed rng for testing via static injection
          },
        },
        {
          node_id: 'n2',
          atom_type: 'threshold_compare',
          inputs: {
            // We can't inject rng directly, so use static value
            value: { type: 'static', value: 4 },
            threshold: { type: 'static', value: 3 },
            operator: { type: 'static', value: '>=' },
          },
        },
        {
          node_id: 'n3',
          atom_type: 'result_collector',
          inputs: {
            entries: { type: 'static', value: { passed: true } },
          },
        },
      ],
      output_node_id: 'n3',
    };

    const result = executor.execute(graph);
    expect(result.success).toBe(true);
    expect(result.logs).toHaveLength(3);
    const output = result.output as Record<string, unknown>;
    expect(output['passed']).toBe(true);
  });

  it('应执行引用链: multiply 使用 static 输入', () => {
    const executor = new GraphExecutor(globalRegistry);
    const graph: GraphDef = {
      nodes: [
        {
          node_id: 'mul1',
          atom_type: 'multiply',
          inputs: {
            a: { type: 'static', value: 3 },
            b: { type: 'static', value: 4 },
          },
        },
        {
          node_id: 'cmp1',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'mul1', output_key: 'value' },
            threshold: { type: 'static', value: 10 },
            operator: { type: 'static', value: '>' },
          },
        },
        {
          node_id: 'collect',
          atom_type: 'result_collector',
          inputs: {
            entries: { type: 'static', value: { mul_result: 12, check: true } },
          },
        },
      ],
      output_node_id: 'collect',
    };

    const result = executor.execute(graph);
    expect(result.success).toBe(true);
    // Check that multiply result was 12 and threshold compare returned true
    const mulLog = result.logs.find(l => l.node_id === 'mul1');
    expect((mulLog?.output as Record<string, unknown>)['value']).toBe(12);
    const cmpLog = result.logs.find(l => l.node_id === 'cmp1');
    expect((cmpLog?.output as Record<string, unknown>)['passed']).toBe(true);
  });

  it('应检测循环依赖并抛出错误', () => {
    const executor = new GraphExecutor(globalRegistry);
    const graph: GraphDef = {
      nodes: [
        {
          node_id: 'a',
          atom_type: 'multiply',
          inputs: {
            a: { type: 'ref', node_id: 'b', output_key: 'value' },
            b: { type: 'static', value: 2 },
          },
        },
        {
          node_id: 'b',
          atom_type: 'multiply',
          inputs: {
            a: { type: 'ref', node_id: 'a', output_key: 'value' },
            b: { type: 'static', value: 3 },
          },
        },
      ],
      output_node_id: 'b',
    };

    const result = executor.execute(graph);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cycle/i);
  });

  it('应对未知原子类型返回错误', () => {
    const registry = new AtomRegistry();
    const executor = new GraphExecutor(registry);
    const graph: GraphDef = {
      nodes: [
        {
          node_id: 'n1',
          atom_type: 'unknown_type_xyz',
          inputs: {},
        },
      ],
      output_node_id: 'n1',
    };

    const result = executor.execute(graph);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown atom type/i);
  });
});

// ─── MAX_GRAPH_NODES 边界测试 ──────────────────────────────────────────────

describe('GraphExecutor — GRAPH_MAX_NODES 边界', () => {
  /**
   * 助手：生成 n 个孤立的 result_collector 节点的合法图。
   * 每个节点均为 static 输入，互不依赖，只有最后一个节点为 output。
   */
  function makeNNodeGraph(n: number): GraphDef {
    const nodes: GraphDef['nodes'] = Array.from({ length: n }, (_, i) => ({
      node_id: `node-${i}`,
      atom_type: 'result_collector',
      inputs: {
        entries: { type: 'static' as const, value: { index: i } },
      },
    }));
    return { nodes, output_node_id: `node-${n - 1}` };
  }

  it(`节点数 = ${GRAPH_MAX_NODES} 时执行成功（恰好在限制内）`, () => {
    const executor = new GraphExecutor(globalRegistry);
    const graph = makeNNodeGraph(GRAPH_MAX_NODES);
    const result = executor.execute(graph);
    expect(result.success).toBe(true);
  });

  it(`节点数 = ${GRAPH_MAX_NODES + 1} 时返回失败，error_code=DSL_EVAL_ERROR`, () => {
    const executor = new GraphExecutor(globalRegistry);
    const graph = makeNNodeGraph(GRAPH_MAX_NODES + 1);
    const result = executor.execute(graph);
    expect(result.success).toBe(false);
    expect(result.error_code).toBe('DSL_EVAL_ERROR');
    expect(result.error).toMatch(/exceed.*maximum node count|maximum node count/i);
  });

  it('超限后，下一次合法图可正常执行（执行器无状态，可恢复）', () => {
    const executor = new GraphExecutor(globalRegistry);

    // 第一次：超限
    const oversized = makeNNodeGraph(GRAPH_MAX_NODES + 1);
    const failResult = executor.execute(oversized);
    expect(failResult.success).toBe(false);

    // 第二次：合法图
    const validGraph: GraphDef = {
      nodes: [
        {
          node_id: 'n1',
          atom_type: 'result_collector',
          inputs: { entries: { type: 'static', value: { ok: true } } },
        },
      ],
      output_node_id: 'n1',
    };
    const recoverResult = executor.execute(validGraph);
    expect(recoverResult.success).toBe(true);
    const output = recoverResult.output as Record<string, unknown>;
    expect(output['ok']).toBe(true);
  });

  it('节点数 = 0 时返回失败（已有 nodes.length === 0 保护）', () => {
    const executor = new GraphExecutor(globalRegistry);
    const graph: GraphDef = { nodes: [], output_node_id: 'nonexistent' };
    const result = executor.execute(graph);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no nodes/i);
  });

  it('节点数 = 1 时执行成功（最小合法图）', () => {
    const executor = new GraphExecutor(globalRegistry);
    const graph: GraphDef = {
      nodes: [
        {
          node_id: 'single',
          atom_type: 'result_collector',
          inputs: { entries: { type: 'static', value: { result: 42 } } },
        },
      ],
      output_node_id: 'single',
    };
    const result = executor.execute(graph);
    expect(result.success).toBe(true);
    const output = result.output as Record<string, unknown>;
    expect(output['result']).toBe(42);
  });
});
