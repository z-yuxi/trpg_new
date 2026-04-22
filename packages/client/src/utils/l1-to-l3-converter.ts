/**
 * l1-to-l3-converter.ts
 * 纯函数：将 L1 表单配置(_l1_config)转换为 L3 节点图(CommandGraphNode[])
 *
 * 规则：
 * - roll_under: DiceRoll → ThresholdCompare(less_than) → ResultCollector
 * - roll_over:  DiceRoll → ThresholdCompare(greater_than) → ResultCollector
 * - dice_pool:  DiceRoll → FormulaEval(countSuccesses) → ThresholdCompare(greater_or_equal) → ResultCollector
 *
 * 额外节点：
 * - CharacterSkillReader（读取技能值作为 threshold）
 * - difficulty_levels 生成 IfElse 链（修正值应用）
 * - crit_success_max / crit_fail_min 生成额外 ThresholdCompare 分支
 */

import type { CommandGraphNode, CommandGraph } from '@trpg/shared';

// ── 输入类型 ───────────────────────────────────────────────────────────────
export interface L1Config {
  check_mode: 'roll_under' | 'roll_over' | 'dice_pool';
  default_dice: string;
  success_formula: string;
  crit_success_max: number;
  crit_fail_min: number;
  bonus_dice?: string;
  difficulty_levels: Array<{ name: string; threshold: number }>;
  resources: Array<{ name: string; max_formula: string; recovery: string }>;
  attributes: Array<{ name: string; roll_formula: string }>;
  supported_commands: string[];
  // 骰池专用参数（可选，缺省时使用默认值）
  dice_pool_success_threshold?: number;
  dice_pool_target?: number;
}

// ── 输出类型 ───────────────────────────────────────────────────────────────
export interface NodePosition {
  node_id: string;
  x: number;
  y: number;
}

export interface ConversionResult {
  graph: CommandGraph;
  layout: NodePosition[];
  /** 转换中使用了哪些默认值 */
  used_defaults: string[];
}

// ── ID 工厂 ───────────────────────────────────────────────────────────────
let _seq = 0;
function uid(prefix: string): string {
  return `${prefix}_${++_seq}`;
}

// ── 位置辅助 ─────────────────────────────────────────────────────────────
function pos(nodeId: string, col: number, row: number, layout: NodePosition[]): void {
  layout.push({ node_id: nodeId, x: col * 240, y: row * 120 });
}

// ── 主转换函数 ──────────────────────────────────────────────────────────────
export function convertL1ToL3(l1: L1Config): ConversionResult {
  _seq = 0; // 重置序号，确保纯函数幂等（同输入同输出）
  const nodes: CommandGraphNode[] = [];
  const layout: NodePosition[] = [];
  const used_defaults: string[] = [];

  if (l1.check_mode === 'dice_pool') {
    return _buildDicePool(l1, nodes, layout, used_defaults);
  }

  // ── roll_under / roll_over ───────────────────────────────────────────────
  const mode = l1.check_mode === 'roll_under' ? 'less_than' : 'greater_than';

  // 1. DiceRoll 节点
  const diceId = uid('dice_roll');
  nodes.push({
    node_id: diceId,
    atom_type: 'dice_roll',
    inputs: {
      expression: { type: 'static', value: l1.default_dice },
    },
  });
  pos(diceId, 0, 0, layout);

  // 2. CharacterSkillReader（读取技能值作为阈值）
  const readerId = uid('character_skill_reader');
  nodes.push({
    node_id: readerId,
    atom_type: 'character_skill_reader',
    inputs: {
      field_type: { type: 'static', value: 'skill' },
      field_name: { type: 'static', value: 'skill_value' },
    },
  });
  pos(readerId, 0, 1, layout);

  // 3. 难度等级调整（table_lookup + formula_eval）
  let modifierId: string | null = null;
  const nonTrivialLevels = l1.difficulty_levels.filter((d) => d.threshold !== 0);
  if (nonTrivialLevels.length > 0) {
    // 将 difficulty_levels 编码为查找表： [[name, threshold], ...]
    const tableData = l1.difficulty_levels.map((d) => [d.name, d.threshold]);
    const lookupId = uid('table_lookup');
    nodes.push({
      node_id: lookupId,
      atom_type: 'table_lookup',
      inputs: {
        table_data: { type: 'static', value: tableData },
        lookup_key: { type: 'static', value: l1.difficulty_levels[0]?.name ?? '普通' },
        mode: { type: 'static', value: 'exact' },
      },
    });
    pos(lookupId, 1, 2, layout);

    // 用 formula_eval 计算修正后的技能阈值
    // table_lookup 返回 result_row 为 [name, threshold] 数组，用 index 1 取得修正值
    // 使用 formula_eval 计算： variables.skill + variables.modifier
    modifierId = uid('formula_eval');
    nodes.push({
      node_id: modifierId,
      atom_type: 'formula_eval',
      inputs: {
        formula: { type: 'static', value: 'skill + modifier' },
        variables: { type: 'static', value: { skill: 0, modifier: 0 } },
        skill: { type: 'ref', node_id: readerId, output_key: 'value' },
        modifier: { type: 'ref', node_id: lookupId, output_key: 'threshold_value' },
      },
    });
    pos(modifierId, 1, 1, layout);
  }

  // 将 roll_under/roll_over 模式映射为实际运算符
  const operatorMap: Record<string, string> = {
    less_than: '<',
    greater_than: '>',
  };
  const operator = operatorMap[mode] ?? '<';

  // 4. ThresholdCompare 节点
  const cmpId = uid('threshold_compare');
  const thresholdRef = modifierId
    ? { type: 'ref' as const, node_id: modifierId, output_key: 'value' }
    : { type: 'ref' as const, node_id: readerId, output_key: 'value' };
  nodes.push({
    node_id: cmpId,
    atom_type: 'threshold_compare',
    inputs: {
      value: { type: 'ref', node_id: diceId, output_key: 'total' },
      threshold: thresholdRef,
      operator: { type: 'static', value: operator },
    },
  });
  pos(cmpId, 2, 0, layout);

  // 5. 大成功/大失败分支
  const critSuccId = uid('threshold_compare');
  nodes.push({
    node_id: critSuccId,
    atom_type: 'threshold_compare',
    inputs: {
      value: { type: 'ref', node_id: diceId, output_key: 'total' },
      threshold: { type: 'static', value: l1.crit_success_max },
      operator: { type: 'static', value: '<=' },
    },
  });
  pos(critSuccId, 2, 1, layout);

  const critFailId = uid('threshold_compare');
  nodes.push({
    node_id: critFailId,
    atom_type: 'threshold_compare',
    inputs: {
      value: { type: 'ref', node_id: diceId, output_key: 'total' },
      threshold: { type: 'static', value: l1.crit_fail_min },
      operator: { type: 'static', value: '>=' },
    },
  });
  pos(critFailId, 2, 2, layout);

  // 6. ResultCollector
  const outId = uid('result_collector');
  nodes.push({
    node_id: outId,
    atom_type: 'result_collector',
    inputs: {
      entries: { type: 'ref', node_id: cmpId, output_key: 'passed' },
      crit_success: { type: 'ref', node_id: critSuccId, output_key: 'passed' },
      crit_fail: { type: 'ref', node_id: critFailId, output_key: 'passed' },
    },
  });
  pos(outId, 3, 0, layout);

  return {
    graph: { nodes, output_node_id: outId },
    layout,
    used_defaults,
  };
}

// ── 骰池模式 ──────────────────────────────────────────────────────────────
function _buildDicePool(
  l1: L1Config,
  nodes: CommandGraphNode[],
  layout: NodePosition[],
  used_defaults: string[],
): ConversionResult {
  let successThreshold = l1.dice_pool_success_threshold;
  let poolTarget = l1.dice_pool_target;

  if (successThreshold === undefined) {
    successThreshold = 5;
    used_defaults.push('dice_pool_success_threshold');
  }
  if (poolTarget === undefined) {
    poolTarget = 1;
    used_defaults.push('dice_pool_target');
  }

  // 1. DiceRoll（骰池）
  const diceId = uid('dice_roll');
  nodes.push({
    node_id: diceId,
    atom_type: 'dice_roll',
    inputs: {
      expression: { type: 'static', value: l1.default_dice },
    },
  });
  pos(diceId, 0, 0, layout);

  // 2. FormulaEval（计算成功骰数量）
  const formulaId = uid('formula_eval');
  nodes.push({
    node_id: formulaId,
    atom_type: 'formula_eval',
    inputs: {
      formula: { type: 'static', value: `countSuccesses(dice, ${successThreshold})` },
      variables: { type: 'static', value: { dice: [] } },
      dice: { type: 'ref', node_id: diceId, output_key: 'rolls' },
    },
  });
  pos(formulaId, 1, 0, layout);

  // 3. ThresholdCompare（成功骰数 >= 目标数）
  const cmpId = uid('threshold_compare');
  nodes.push({
    node_id: cmpId,
    atom_type: 'threshold_compare',
    inputs: {
      value: { type: 'ref', node_id: formulaId, output_key: 'value' },
      threshold: { type: 'static', value: poolTarget },
      operator: { type: 'static', value: '>=' },
    },
  });
  pos(cmpId, 2, 0, layout);

  // 4. ResultCollector
  const outId = uid('result_collector');
  nodes.push({
    node_id: outId,
    atom_type: 'result_collector',
    inputs: {
      entries: { type: 'ref', node_id: cmpId, output_key: 'passed' },
    },
  });
  pos(outId, 3, 0, layout);

  return {
    graph: { nodes, output_node_id: outId },
    layout,
    used_defaults,
  };
}
