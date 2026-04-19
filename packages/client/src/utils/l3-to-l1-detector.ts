/**
 * l3-to-l1-detector.ts
 * 纯函数：分析 L3 节点图是否匹配 L1 模板模式，并提取参数回填
 *
 * 规则：
 * - 图中仅包含 DiceRoll + (可选)CharacterSkillReader + ThresholdCompare + (可选)FormulaEval + ResultCollector
 * - 连线模式符合 L1 标准检定图
 * - 若超出模板范围（如 IfElse / resource_modify 等），返回 'l3-only'
 */

import type { CommandGraph, CommandGraphNode } from '@trpg/shared';
import type { L1Config } from './l1-to-l3-converter';

// ── 允许出现在 L1 模板图中的原子类型 ─────────────────────────────────────────
const L1_ALLOWED_ATOM_TYPES = new Set([
  'dice_roll',
  'character_skill_reader',
  'formula_eval',
  'threshold_compare',
  'result_collector',
]);

export type DetectResult =
  | { matched: true; check_mode: 'roll_under' | 'roll_over' | 'dice_pool'; extracted: Partial<L1Config> }
  | { matched: false; reason: 'l3-only' | 'empty-graph' };

// ── 主检测函数 ──────────────────────────────────────────────────────────────
export function detectL3ToL1(graph: CommandGraph): DetectResult {
  const { nodes } = graph;

  if (nodes.length === 0) {
    return { matched: false, reason: 'empty-graph' };
  }

  // 若存在任何非 L1 允许的原子类型，视为 l3-only
  const hasCustomAtom = nodes.some((n) => !L1_ALLOWED_ATOM_TYPES.has(n.atom_type));
  if (hasCustomAtom) {
    return { matched: false, reason: 'l3-only' };
  }

  // ── 提取各节点 ──────────────────────────────────────────────────────────
  const diceNodes = nodes.filter((n) => n.atom_type === 'dice_roll');
  const cmpNodes = nodes.filter((n) => n.atom_type === 'threshold_compare');
  const formulaNodes = nodes.filter((n) => n.atom_type === 'formula_eval');
  const outNodes = nodes.filter((n) => n.atom_type === 'result_collector');

  if (diceNodes.length === 0 || outNodes.length === 0) {
    return { matched: false, reason: 'l3-only' };
  }

  const diceNode = diceNodes[0];
  const outNode = outNodes[0];

  const defaultDice = getStaticString(diceNode, 'expression') ?? '1d100';

  // ── 判断是否是骰池模式 ───────────────────────────────────────────────────
  // 骰池模式：FormulaEval 节点中包含 countSuccesses
  if (formulaNodes.length > 0) {
    const countFormula = formulaNodes.find((n) => {
      const f = getStaticString(n, 'formula') ?? '';
      return f.includes('countSuccesses');
    });

    if (countFormula) {
      // 提取骰池参数
      const formula = getStaticString(countFormula, 'formula') ?? '';
      const match = formula.match(/countSuccesses\([^,]+,\s*(\d+)\)/);
      const successThreshold = match ? parseInt(match[1], 10) : 5;

      // 从 ThresholdCompare 找 poolTarget
      const poolCmp = cmpNodes.find((n) => {
        const valInput = n.inputs['value'];
        return valInput && (valInput as any).type === 'ref' && (valInput as any).node_id === countFormula.node_id;
      });
      const poolTarget = poolCmp ? getStaticNumber(poolCmp, 'threshold') ?? 1 : 1;

      return {
        matched: true,
        check_mode: 'dice_pool',
        extracted: {
          check_mode: 'dice_pool',
          default_dice: defaultDice,
          dice_pool_success_threshold: successThreshold,
          dice_pool_target: poolTarget,
        },
      };
    }
  }

  // ── 判断 roll_under / roll_over ───────────────────────────────────────────
  // 找主 ThresholdCompare 节点（直接连接 dice_roll 输出的那个）
  const mainCmp = cmpNodes.find((n) => {
    const valInput = n.inputs['value'];
    return (
      valInput &&
      (valInput as any).type === 'ref' &&
      (valInput as any).node_id === diceNode.node_id
    );
  });

  if (!mainCmp) {
    return { matched: false, reason: 'l3-only' };
  }

  const modeValue = getStaticString(mainCmp, 'mode') ?? 'less_than';
  const checkMode: 'roll_under' | 'roll_over' =
    modeValue === 'greater_than' ? 'roll_over' : 'roll_under';

  // 提取大成功/大失败阈值（可选）
  const critSuccNode = cmpNodes.find(
    (n) => n.node_id !== mainCmp.node_id && getStaticString(n, 'mode') === 'less_than_or_equal',
  );
  const critFailNode = cmpNodes.find(
    (n) => n.node_id !== mainCmp.node_id && getStaticString(n, 'mode') === 'greater_than_or_equal',
  );

  const critSuccessMax = critSuccNode ? getStaticNumber(critSuccNode, 'threshold') ?? 5 : 5;
  const critFailMin = critFailNode ? getStaticNumber(critFailNode, 'threshold') ?? 96 : 96;

  // 检查是否有超出模板的节点（如 resource_modify / if_else 等）
  const allowedIds = new Set([
    diceNode.node_id,
    outNode.node_id,
    mainCmp.node_id,
    ...(critSuccNode ? [critSuccNode.node_id] : []),
    ...(critFailNode ? [critFailNode.node_id] : []),
    ...nodes.filter((n) => n.atom_type === 'character_skill_reader').map((n) => n.node_id),
    ...nodes.filter((n) => n.atom_type === 'formula_eval').map((n) => n.node_id),
  ]);
  const hasExtra = nodes.some((n) => !allowedIds.has(n.node_id));
  if (hasExtra) {
    return { matched: false, reason: 'l3-only' };
  }

  return {
    matched: true,
    check_mode: checkMode,
    extracted: {
      check_mode: checkMode,
      default_dice: defaultDice,
      crit_success_max: critSuccessMax,
      crit_fail_min: critFailMin,
    },
  };
}

// ── 辅助函数 ──────────────────────────────────────────────────────────────
function getStaticString(node: CommandGraphNode, key: string): string | undefined {
  const v = node.inputs[key];
  if (v && (v as any).type === 'static') return String((v as any).value);
  return undefined;
}

function getStaticNumber(node: CommandGraphNode, key: string): number | undefined {
  const v = node.inputs[key];
  if (v && (v as any).type === 'static') {
    const n = Number((v as any).value);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}
