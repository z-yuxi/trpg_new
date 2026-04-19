/**
 * canvas-serializer.test.ts
 * 测试画布序列化工具：往返一致性、端口类型兼容性、环路检测
 */
import { describe, it, expect } from 'vitest';
import {
  serializeToGraph,
  deserializeFromGraph,
  isPortCompatible,
  hasCycle,
} from '../utils/canvas-serializer';
import type { CommandGraph } from '@trpg/shared';
import type { Node, Edge } from '@vue-flow/core';
import type { AtomNodeData } from '../utils/canvas-serializer';

// ── 工厂函数 ─────────────────────────────────────────────────────────────
function makeNode(id: string, atomType: string, config: Record<string, { type: 'static'; value: unknown }> = {}): Node<AtomNodeData> {
  return {
    id,
    type: 'atomNode',
    position: { x: 0, y: 0 },
    data: { atom_type: atomType, config, collapsed: false, preview: null },
  };
}

function makeEdge(source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return {
    id: `e_${source}_${sourceHandle}__${target}_${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    type: 'smoothstep',
  };
}

// ── 往返序列化测试 ─────────────────────────────────────────────────────────
describe('canvas-serializer 往返一致性', () => {
  it('简单链式图：dice_roll → threshold_compare → result_collector', () => {
    const originalGraph: CommandGraph = {
      nodes: [
        {
          node_id: 'dice_1',
          atom_type: 'dice_roll',
          inputs: { expression: { type: 'static', value: '1d100' } },
        },
        {
          node_id: 'cmp_1',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice_1', output_key: 'result' },
            threshold: { type: 'static', value: 60 },
          },
        },
        {
          node_id: 'out_1',
          atom_type: 'result_collector',
          inputs: {
            entries: { type: 'ref', node_id: 'cmp_1', output_key: 'passed' },
          },
        },
      ],
      output_node_id: 'out_1',
    };

    // 反序列化为 Vue Flow 格式
    const { nodes, edges, outputNodeId } = deserializeFromGraph(originalGraph);
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    expect(outputNodeId).toBe('out_1');

    // 再序列化回 CommandGraph
    const reserialized = serializeToGraph(nodes, edges, outputNodeId);

    // 节点数量应一致
    expect(reserialized.nodes).toHaveLength(3);
    expect(reserialized.output_node_id).toBe('out_1');

    // 静态输入应保留
    const diceNode = reserialized.nodes.find((n) => n.node_id === 'dice_1')!;
    expect(diceNode.inputs.expression).toEqual({ type: 'static', value: '1d100' });

    // 引用连线应正确恢复
    const cmpNode = reserialized.nodes.find((n) => n.node_id === 'cmp_1')!;
    expect(cmpNode.inputs.value).toEqual({ type: 'ref', node_id: 'dice_1', output_key: 'result' });
  });

  it('空图：无节点时应返回空 graph', () => {
    const empty: CommandGraph = { nodes: [], output_node_id: '' };
    const { nodes, edges } = deserializeFromGraph(empty);
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  it('serializeToGraph 能将连线正确转换为 ref 输入', () => {
    const nodes = [
      makeNode('n1', 'dice_roll', { expression: { type: 'static', value: '2d6' } }),
      makeNode('n2', 'result_collector'),
    ];
    const edges = [makeEdge('n1', 'result', 'n2', 'entries')];
    const graph = serializeToGraph(nodes, edges, 'n2');

    const n2 = graph.nodes.find((n) => n.node_id === 'n2')!;
    expect(n2.inputs.entries).toEqual({ type: 'ref', node_id: 'n1', output_key: 'result' });
  });
});

// ── 端口类型兼容性测试 ─────────────────────────────────────────────────────
describe('isPortCompatible 端口类型兼容性', () => {
  it('number → number 应兼容', () => {
    expect(isPortCompatible('number', 'number')).toBe(true);
  });

  it('boolean → boolean 应兼容', () => {
    expect(isPortCompatible('boolean', 'boolean')).toBe(true);
  });

  it('string → string 应兼容', () => {
    expect(isPortCompatible('string', 'string')).toBe(true);
  });

  it('number → boolean 应不兼容（拒绝错误连线）', () => {
    expect(isPortCompatible('number', 'boolean')).toBe(false);
  });

  it('boolean → number 应不兼容', () => {
    expect(isPortCompatible('boolean', 'number')).toBe(false);
  });

  it('string → number 应不兼容', () => {
    expect(isPortCompatible('string', 'number')).toBe(false);
  });

  it('any → number 应兼容（any 类型可连任意端口）', () => {
    expect(isPortCompatible('any', 'number')).toBe(true);
  });

  it('number → any 应兼容', () => {
    expect(isPortCompatible('number', 'any')).toBe(true);
  });
});

// ── 环路检测测试 ──────────────────────────────────────────────────────────
describe('hasCycle 环路检测', () => {
  it('无环路时应返回 false', () => {
    const nodes = [makeNode('a', 'dice_roll'), makeNode('b', 'threshold_compare'), makeNode('c', 'result_collector')];
    const edges = [makeEdge('a', 'result', 'b', 'value'), makeEdge('b', 'passed', 'c', 'entries')];
    expect(hasCycle(nodes, edges)).toBe(false);
  });

  it('有直接环路时应返回 true（A→B→A）', () => {
    const nodes = [makeNode('a', 'dice_roll'), makeNode('b', 'threshold_compare')];
    const edges = [makeEdge('a', 'result', 'b', 'value'), makeEdge('b', 'passed', 'a', 'expression')];
    expect(hasCycle(nodes, edges)).toBe(true);
  });

  it('有三节点环路时应返回 true（A→B→C→A）', () => {
    const nodes = [makeNode('a', 'dice_roll'), makeNode('b', 'multiply'), makeNode('c', 'result_collector')];
    const edges = [
      makeEdge('a', 'result', 'b', 'a'),
      makeEdge('b', 'result', 'c', 'entries'),
      makeEdge('c', 'result', 'a', 'expression'),
    ];
    expect(hasCycle(nodes, edges)).toBe(true);
  });

  it('孤立节点（无边）不应被视为环路', () => {
    const nodes = [makeNode('solo', 'dice_roll')];
    expect(hasCycle(nodes, [])).toBe(false);
  });
});
