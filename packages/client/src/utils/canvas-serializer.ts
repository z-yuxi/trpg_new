/**
 * canvas-serializer.ts
 * 画布状态（Vue Flow 格式）↔ 规则集后端格式（CommandGraphNode[]）的双向转换
 */

import type { Node, Edge } from '@vue-flow/core';
import type { CommandGraphNode, CommandGraph } from '@trpg/shared';

// ── 端口类型系统 ───────────────────────────────────────────────────────────
export type PortType = 'number' | 'boolean' | 'string' | 'any';

export interface PortDef {
  key: string;
  label: string;
  type: PortType;
  required?: boolean;
}

export interface AtomDef {
  atom_type: string;
  label: string;
  description: string;
  category: 'data' | 'compute' | 'logic' | 'effect' | 'table' | 'output';
  icon: string;
  inputs: PortDef[];
  outputs: PortDef[];
}

// ── 8 种原子节点的端口定义 ─────────────────────────────────────────────────
export const ATOM_DEFINITIONS: Record<string, AtomDef> = {
  dice_roll: {
    atom_type: 'dice_roll',
    label: '掷骰',
    description: '掷骰子并返回结果',
    category: 'compute',
    icon: 'icon-dice',
    inputs: [
      { key: 'expression', label: '骰子表达式', type: 'string', required: true },
    ],
    outputs: [
      { key: 'result', label: '结果值', type: 'number' },
      { key: 'details', label: '详情文本', type: 'string' },
    ],
  },
  character_skill_reader: {
    atom_type: 'character_skill_reader',
    label: '读取角色数据',
    description: '从角色卡读取属性/技能/资源值',
    category: 'data',
    icon: 'icon-user',
    inputs: [
      { key: 'field_name', label: '字段名', type: 'string', required: true },
    ],
    outputs: [
      { key: 'value', label: '数值', type: 'number' },
    ],
  },
  formula_eval: {
    atom_type: 'formula_eval',
    label: '公式计算',
    description: '对公式表达式求值',
    category: 'compute',
    icon: 'icon-ruleset',
    inputs: [
      { key: 'formula', label: '公式', type: 'string', required: true },
      { key: 'variables', label: '变量', type: 'any' },
    ],
    outputs: [
      { key: 'result', label: '结果', type: 'number' },
    ],
  },
  if_else: {
    atom_type: 'if_else',
    label: '条件分支',
    description: '根据条件返回不同值',
    category: 'logic',
    icon: 'icon-timeline',
    inputs: [
      { key: 'condition', label: '条件', type: 'boolean', required: true },
      { key: 'if_true', label: '为真时', type: 'any', required: true },
      { key: 'if_false', label: '为假时', type: 'any', required: true },
    ],
    outputs: [
      { key: 'result', label: '结果', type: 'any' },
    ],
  },
  threshold_compare: {
    atom_type: 'threshold_compare',
    label: '阈值比较',
    description: '将值与阈值比较，返回是否通过',
    category: 'logic',
    icon: 'icon-check',
    inputs: [
      { key: 'value', label: '输入值', type: 'number', required: true },
      { key: 'threshold', label: '阈值', type: 'number', required: true },
    ],
    outputs: [
      { key: 'passed', label: '是否通过', type: 'boolean' },
      { key: 'margin', label: '差值', type: 'number' },
    ],
  },
  multiply: {
    atom_type: 'multiply',
    label: '乘法',
    description: '两数相乘',
    category: 'compute',
    icon: 'icon-close',
    inputs: [
      { key: 'a', label: '数值 A', type: 'number', required: true },
      { key: 'b', label: '数值 B', type: 'number', required: true },
    ],
    outputs: [
      { key: 'result', label: '结果', type: 'number' },
    ],
  },
  resource_modify: {
    atom_type: 'resource_modify',
    label: '修改资源',
    description: '增减角色资源值（如 HP）',
    category: 'effect',
    icon: 'icon-plus',
    inputs: [
      { key: 'resource_name', label: '资源名', type: 'string', required: true },
      { key: 'delta', label: '变化量', type: 'number', required: true },
    ],
    outputs: [
      { key: 'new_value', label: '新值', type: 'number' },
    ],
  },
  result_collector: {
    atom_type: 'result_collector',
    label: '结果收集',
    description: '收集所有输入，生成最终结果',
    category: 'output',
    icon: 'icon-scroll',
    inputs: [
      { key: 'entries', label: '条目', type: 'any', required: true },
    ],
    outputs: [
      { key: 'result', label: '最终结果', type: 'any' },
    ],
  },

  // ── P1 原子 ──────────────────────────────────────────────────────────────
  resource_modify_batch: {
    atom_type: 'resource_modify_batch',
    label: '批量修改资源',
    description: '同时修改 HP、SAN 等多个资源值',
    category: 'effect',
    icon: 'icon-plus',
    inputs: [
      { key: 'modifications', label: '修改列表', type: 'any', required: true },
      { key: 'current_values', label: '当前值映射', type: 'any' },
      { key: 'min_values', label: '最小值映射', type: 'any' },
      { key: 'max_values', label: '最大值映射', type: 'any' },
    ],
    outputs: [
      { key: 'results', label: '修改结果列表', type: 'any' },
    ],
  },
  table_lookup: {
    atom_type: 'table_lookup',
    label: '查表',
    description: '从二维表格按 key 查找对应行',
    category: 'table',
    icon: 'icon-grid',
    inputs: [
      { key: 'table_data', label: '表格数据', type: 'any', required: true },
      { key: 'lookup_key', label: '查找键', type: 'any', required: true },
      { key: 'mode', label: '模式(exact/range/closest)', type: 'string' },
    ],
    outputs: [
      { key: 'result_row', label: '匹配行', type: 'any' },
      { key: 'found', label: '是否找到', type: 'boolean' },
    ],
  },
  random_table: {
    atom_type: 'random_table',
    label: '随机表',
    description: '按权重从条目列表中随机选取',
    category: 'table',
    icon: 'icon-dice',
    inputs: [
      { key: 'table_entries', label: '条目列表', type: 'any', required: true },
      { key: 'roll_expression', label: '骰子表达式(可选)', type: 'string' },
    ],
    outputs: [
      { key: 'selected_entry', label: '选中条目', type: 'any' },
      { key: 'roll_result', label: '骰点结果', type: 'number' },
    ],
  },
  effect_apply: {
    atom_type: 'effect_apply',
    label: '施加效果',
    description: '给角色施加临时状态效果',
    category: 'effect',
    icon: 'icon-highlight',
    inputs: [
      { key: 'target_character_id', label: '目标角色ID', type: 'string', required: true },
      { key: 'effect_name', label: '效果名称', type: 'string', required: true },
      { key: 'duration_type', label: '持续类型', type: 'string' },
      { key: 'duration_value', label: '持续值', type: 'number' },
      { key: 'modifiers', label: '属性修改器', type: 'any' },
    ],
    outputs: [
      { key: 'effect_id', label: '效果ID', type: 'string' },
      { key: 'applied_success', label: '施加成功', type: 'boolean' },
    ],
  },
  effect_remove: {
    atom_type: 'effect_remove',
    label: '移除效果',
    description: '移除角色的临时状态效果',
    category: 'effect',
    icon: 'icon-trash',
    inputs: [
      { key: 'target_character_id', label: '目标角色ID', type: 'string', required: true },
      { key: 'effect_id', label: '效果ID(二选一)', type: 'string' },
      { key: 'effect_name', label: '效果名称(二选一)', type: 'string' },
    ],
    outputs: [
      { key: 'removed_success', label: '移除成功', type: 'boolean' },
    ],
  },
  loop: {
    atom_type: 'loop',
    label: '循环',
    description: '循环 N 次，每次对值做累加或累乘',
    category: 'logic',
    icon: 'icon-history',
    inputs: [
      { key: 'iterations', label: '循环次数', type: 'number', required: true },
      { key: 'initial_value', label: '初始值', type: 'number' },
      { key: 'step_value', label: '步长', type: 'number' },
      { key: 'operation', label: '操作(add/mul)', type: 'string' },
    ],
    outputs: [
      { key: 'iteration_results', label: '各次结果', type: 'any' },
      { key: 'final_value', label: '最终值', type: 'number' },
      { key: 'iterations_completed', label: '完成次数', type: 'number' },
    ],
  },
  aggregate: {
    atom_type: 'aggregate',
    label: '聚合',
    description: '对数组做 sum/min/max/avg/count/concat 聚合',
    category: 'compute',
    icon: 'icon-list',
    inputs: [
      { key: 'values', label: '输入数组', type: 'any', required: true },
      { key: 'operation', label: '操作', type: 'string', required: true },
      { key: 'separator', label: '拼接分隔符(concat)', type: 'string' },
    ],
    outputs: [
      { key: 'result', label: '聚合结果', type: 'any' },
      { key: 'count', label: '元素数量', type: 'number' },
    ],
  },
  conditional_branch: {
    atom_type: 'conditional_branch',
    label: '多分支条件',
    description: 'switch-case 风格分支选择',
    category: 'logic',
    icon: 'icon-broadcast',
    inputs: [
      { key: 'value', label: '输入值', type: 'any', required: true },
      { key: 'branches', label: '分支列表', type: 'any', required: true },
    ],
    outputs: [
      { key: 'matched_branch', label: '匹配分支索引', type: 'number' },
      { key: 'matched_label', label: '匹配标签', type: 'string' },
      { key: 'is_default', label: '是否默认', type: 'boolean' },
    ],
  },
};

// ── 类型兼容性校验 ─────────────────────────────────────────────────────────
/** 判断 fromType 是否可以连接到 toType */
export function isPortCompatible(fromType: PortType, toType: PortType): boolean {
  if (toType === 'any' || fromType === 'any') return true;
  return fromType === toType;
}

// ── 拓扑环路检测 ─────────────────────────────────────────────────────────
/** 检测给定边集合中是否存在环路（DFS），返回是否有环 */
export function hasCycle(nodes: Node[], edges: Edge[]): boolean {
  const adj: Map<string, string[]> = new Map();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  });

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    for (const next of adj.get(id) ?? []) {
      if (dfs(next)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const n of nodes) {
    if (dfs(n.id)) return true;
  }
  return false;
}

// ── Vue Flow Node 扩展数据 ─────────────────────────────────────────────────
export interface AtomNodeData {
  atom_type: string;
  /** 节点的静态/连线输入配置（key→值或 {node_id, output_key}） */
  config: Record<string, { type: 'static'; value: unknown } | { type: 'ref'; node_id: string; output_key: string }>;
  /** 是否折叠 */
  collapsed?: boolean;
  /** 运行后的预览输出（用于预览动画） */
  preview?: Record<string, unknown> | null;
}

// ── 序列化：Vue Flow → CommandGraph ───────────────────────────────────────
/**
 * 将 Vue Flow 的 nodes + edges 转换为后端 CommandGraph 格式
 * @param nodes Vue Flow 节点列表
 * @param edges Vue Flow 边列表
 * @param outputNodeId 标记为输出的节点 ID
 */
export function serializeToGraph(
  nodes: Node<AtomNodeData>[],
  edges: Edge[],
  outputNodeId: string,
): CommandGraph {
  const graphNodes: CommandGraphNode[] = nodes.map((n) => {
    const data = n.data;
    const inputs: CommandGraphNode['inputs'] = {};

    // 静态配置来自节点 data.config
    const config = data?.config ?? {};
    for (const [key, val] of Object.entries(config)) {
      inputs[key] = val as CommandGraphNode['inputs'][string];
    }

    // 连线引用：从 edges 中找到以该节点为 target 的边，覆盖 inputs
    const incomingEdges = edges.filter((e) => e.target === n.id);
    for (const edge of incomingEdges) {
      // edge.targetHandle = "inputKey", edge.sourceHandle = "outputKey"
      const inputKey = edge.targetHandle ?? '';
      const outputKey = edge.sourceHandle ?? 'result';
      if (inputKey) {
        inputs[inputKey] = { type: 'ref', node_id: edge.source, output_key: outputKey };
      }
    }

    return {
      node_id: n.id,
      atom_type: data?.atom_type ?? n.type ?? 'unknown',
      inputs,
    };
  });

  return { nodes: graphNodes, output_node_id: outputNodeId };
}

// ── 反序列化：CommandGraph → Vue Flow ────────────────────────────────────
/**
 * 将后端 CommandGraph 反序列化为 Vue Flow nodes + edges
 */
export function deserializeFromGraph(graph: CommandGraph): {
  nodes: Node<AtomNodeData>[];
  edges: Edge[];
  outputNodeId: string;
} {
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 140;
  const H_GAP = 240;
  const V_GAP = 160;

  // 简单网格布局（如已有 position 则保留，否则自动排列）
  const nodes: Node<AtomNodeData>[] = graph.nodes.map((gn, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    return {
      id: gn.node_id,
      type: 'atomNode',
      position: { x: col * (NODE_WIDTH + H_GAP), y: row * (NODE_HEIGHT + V_GAP) },
      data: {
        atom_type: gn.atom_type,
        config: Object.fromEntries(
          Object.entries(gn.inputs)
            .filter(([, v]) => (v as any).type === 'static')
            .map(([k, v]) => [k, v]),
        ),
        collapsed: false,
        preview: null,
      },
    };
  });

  // 将 ref 类型输入转换为 edges
  const edges: Edge[] = [];
  for (const gn of graph.nodes) {
    for (const [inputKey, src] of Object.entries(gn.inputs)) {
      if ((src as any).type === 'ref') {
        const ref = src as { type: 'ref'; node_id: string; output_key: string };
        edges.push({
          id: `e_${ref.node_id}_${ref.output_key}__${gn.node_id}_${inputKey}`,
          source: ref.node_id,
          sourceHandle: ref.output_key,
          target: gn.node_id,
          targetHandle: inputKey,
          type: 'smoothstep',
        });
      }
    }
  }

  return { nodes, edges, outputNodeId: graph.output_node_id };
}
