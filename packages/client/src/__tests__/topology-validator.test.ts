/**
 * topology-validator.test.ts
 * 测试拓扑校验函数：环路检测、孤立节点、输出节点唯一性
 *
 * 注意：这些测试直接调用 canvas-serializer 中的 hasCycle 和独立实现的校验逻辑。
 * RuleCanvas 内部的 runTopologyValidation 不在此单元测试中（由 RuleCanvas.spec.ts 覆盖）。
 */
import { describe, it, expect } from 'vitest';
import { hasCycle, ATOM_DEFINITIONS } from '../utils/canvas-serializer';
import type { Node, Edge } from '@vue-flow/core';
import type { AtomNodeData } from '../utils/canvas-serializer';

// ── 工厂函数 ─────────────────────────────────────────────────────────────
function makeNode(id: string, atomType: string): Node<AtomNodeData> {
  return {
    id,
    type: 'atomNode',
    position: { x: 0, y: 0 },
    data: { atom_type: atomType, config: {}, collapsed: false, preview: null },
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

// ── 辅助：运行孤立节点检测（复制自 RuleCanvas.vue 的校验逻辑） ───────────────
function findIsolatedNodes(nodes: Node[], edges: Edge[]): string[] {
  if (nodes.length <= 1) return [];
  const connected = new Set<string>();
  edges.forEach((e) => { connected.add(e.source); connected.add(e.target); });
  return nodes.filter((n) => !connected.has(n.id)).map((n) => n.id);
}

// ── 辅助：检查必需端口缺失 ──────────────────────────────────────────────────
function findMissingRequiredPorts(
  nodes: Node<AtomNodeData>[],
  edges: Edge[],
): Array<{ nodeId: string; portKey: string }> {
  const missing: Array<{ nodeId: string; portKey: string }> = [];
  for (const n of nodes) {
    const def = ATOM_DEFINITIONS[n.data?.atom_type];
    if (!def) continue;
    for (const port of def.inputs) {
      if (!port.required) continue;
      const hasEdge = edges.some((e) => e.target === n.id && e.targetHandle === port.key);
      const hasStatic =
        n.data?.config?.[port.key]?.type === 'static' &&
        (n.data.config[port.key] as any).value !== '';
      if (!hasEdge && !hasStatic) {
        missing.push({ nodeId: n.id, portKey: port.key });
      }
    }
  }
  return missing;
}

// ── 辅助：输出节点唯一性 ─────────────────────────────────────────────────────
function checkOutputNodeUniqueness(
  nodes: Node<AtomNodeData>[],
  outputNodeId: string,
): { valid: boolean; reason?: string } {
  const collectors = nodes.filter((n) => n.data?.atom_type === 'result_collector');
  if (collectors.length === 0) return { valid: false, reason: 'no-collector' };
  if (!outputNodeId) return { valid: false, reason: 'no-output-node-id' };
  return { valid: true };
}

// ══════════════════════════════════════════════════════════════════════════════
describe('topology-validator', () => {
  // ── 环路检测 ──────────────────────────────────────────────────────────────
  describe('环路检测（hasCycle）', () => {
    it('标准检定链（无环）应返回 false', () => {
      const nodes = [
        makeNode('dice', 'dice_roll'),
        makeNode('cmp', 'threshold_compare'),
        makeNode('out', 'result_collector'),
      ];
      const edges = [
        makeEdge('dice', 'result', 'cmp', 'value'),
        makeEdge('cmp', 'passed', 'out', 'entries'),
      ];
      expect(hasCycle(nodes, edges)).toBe(false);
    });

    it('直接自环（A→A）应检测为有环', () => {
      const nodes = [makeNode('a', 'formula_eval')];
      const edges = [makeEdge('a', 'result', 'a', 'formula')];
      expect(hasCycle(nodes, edges)).toBe(true);
    });

    it('两节点互连（A→B→A）应检测为有环', () => {
      const nodes = [makeNode('a', 'dice_roll'), makeNode('b', 'threshold_compare')];
      const edges = [
        makeEdge('a', 'result', 'b', 'value'),
        makeEdge('b', 'passed', 'a', 'expression'),
      ];
      expect(hasCycle(nodes, edges)).toBe(true);
    });

    it('三节点环路（A→B→C→A）应检测为有环', () => {
      const nodes = [
        makeNode('a', 'dice_roll'),
        makeNode('b', 'multiply'),
        makeNode('c', 'result_collector'),
      ];
      const edges = [
        makeEdge('a', 'result', 'b', 'a'),
        makeEdge('b', 'result', 'c', 'entries'),
        makeEdge('c', 'result', 'a', 'expression'),
      ];
      expect(hasCycle(nodes, edges)).toBe(true);
    });

    it('单个孤立节点不应误判为环路', () => {
      const nodes = [makeNode('solo', 'dice_roll')];
      expect(hasCycle(nodes, [])).toBe(false);
    });
  });

  // ── 孤立节点检测 ──────────────────────────────────────────────────────────
  describe('孤立节点检测', () => {
    it('所有节点都有连线时应无孤立节点', () => {
      const nodes = [makeNode('a', 'dice_roll'), makeNode('b', 'result_collector')];
      const edges = [makeEdge('a', 'result', 'b', 'entries')];
      expect(findIsolatedNodes(nodes, edges)).toHaveLength(0);
    });

    it('存在未连接的节点时应检测到孤立节点', () => {
      const nodes = [
        makeNode('a', 'dice_roll'),
        makeNode('b', 'result_collector'),
        makeNode('c', 'multiply'), // 孤立
      ];
      const edges = [makeEdge('a', 'result', 'b', 'entries')];
      const isolated = findIsolatedNodes(nodes, edges);
      expect(isolated).toContain('c');
      expect(isolated).not.toContain('a');
      expect(isolated).not.toContain('b');
    });

    it('只有一个节点时不应视为孤立', () => {
      const nodes = [makeNode('solo', 'dice_roll')];
      expect(findIsolatedNodes(nodes, [])).toHaveLength(0);
    });
  });

  // ── 必需端口缺失 ──────────────────────────────────────────────────────────
  describe('必需输入端口缺失检测', () => {
    it('dice_roll 节点有静态 expression 时不应报缺失', () => {
      const nodes = [
        {
          ...makeNode('dice', 'dice_roll'),
          data: {
            atom_type: 'dice_roll',
            config: { expression: { type: 'static' as const, value: '1d6' } },
            collapsed: false,
            preview: null,
          },
        },
      ];
      expect(findMissingRequiredPorts(nodes, [])).toHaveLength(0);
    });

    it('dice_roll 节点没有 expression 时应报缺失', () => {
      const nodes = [makeNode('dice', 'dice_roll')]; // config 为空
      const missing = findMissingRequiredPorts(nodes, []);
      expect(missing.some((m) => m.nodeId === 'dice' && m.portKey === 'expression')).toBe(true);
    });

    it('通过连线提供必需输入时不应报缺失', () => {
      const srcNode = makeNode('src', 'dice_roll');
      const tgtNode = makeNode('cmp', 'threshold_compare');
      const edges = [makeEdge('src', 'result', 'cmp', 'value')];
      // value 是 threshold_compare 的必需输入，现在通过连线提供
      const missing = findMissingRequiredPorts([srcNode, tgtNode], edges);
      expect(missing.some((m) => m.nodeId === 'cmp' && m.portKey === 'value')).toBe(false);
    });
  });

  // ── 输出节点唯一性 ──────────────────────────────────────────────────────────
  describe('输出节点唯一性', () => {
    it('有 result_collector 且 outputNodeId 已设置时应通过', () => {
      const nodes = [makeNode('out', 'result_collector')];
      const result = checkOutputNodeUniqueness(nodes, 'out');
      expect(result.valid).toBe(true);
    });

    it('没有 result_collector 时应不通过', () => {
      const nodes = [makeNode('dice', 'dice_roll')];
      const result = checkOutputNodeUniqueness(nodes, '');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('no-collector');
    });

    it('有 result_collector 但未设置 outputNodeId 时应不通过', () => {
      const nodes = [makeNode('out', 'result_collector')];
      const result = checkOutputNodeUniqueness(nodes, '');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('no-output-node-id');
    });
  });
});
