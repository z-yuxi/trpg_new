/**
 * l1-to-l3-converter.test.ts
 * 测试 L1 → L3 转换器：三种 check_mode 的节点数和连线数
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { convertL1ToL3 } from '../utils/l1-to-l3-converter';
import type { L1Config } from '../utils/l1-to-l3-converter';

const BASE_L1: L1Config = {
  check_mode: 'roll_under',
  default_dice: '1d100',
  success_formula: 'roll <= skill',
  crit_success_max: 5,
  crit_fail_min: 96,
  bonus_dice: '',
  difficulty_levels: [
    { name: '普通', threshold: 0 },
    { name: '困难', threshold: -20 },
  ],
  resources: [{ name: '生命值', max_formula: 'CON / 10', recovery: '休息' }],
  attributes: [{ name: '力量', roll_formula: '3d6 * 5' }],
  supported_commands: ['roll', 'check'],
};

describe('l1-to-l3-converter', () => {
  describe('roll_under 模式', () => {
    it('应生成 dice_roll 节点', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under' });
      const diceNodes = graph.nodes.filter((n) => n.atom_type === 'dice_roll');
      expect(diceNodes.length).toBe(1);
      expect((diceNodes[0].inputs.expression as any).value).toBe('1d100');
    });

    it('应生成 threshold_compare 节点（主检定 + 大成功 + 大失败）', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under' });
      const cmpNodes = graph.nodes.filter((n) => n.atom_type === 'threshold_compare');
      expect(cmpNodes.length).toBeGreaterThanOrEqual(3);
    });

    it('主 threshold_compare 的 mode 应为 less_than', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under' });
      const diceNode = graph.nodes.find((n) => n.atom_type === 'dice_roll')!;
      // 找到 value 连接 dice_roll 的那个 compare
      const mainCmp = graph.nodes.find(
        (n) =>
          n.atom_type === 'threshold_compare' &&
          (n.inputs.value as any)?.node_id === diceNode.node_id,
      )!;
      expect((mainCmp.inputs.mode as any).value).toBe('less_than');
    });

    it('应生成 result_collector 作为输出节点', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under' });
      expect(graph.output_node_id).toBeTruthy();
      const outNode = graph.nodes.find((n) => n.node_id === graph.output_node_id)!;
      expect(outNode.atom_type).toBe('result_collector');
    });

    it('有非零难度等级时应生成 formula_eval 节点', () => {
      const { graph } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'roll_under',
        difficulty_levels: [{ name: '困难', threshold: -20 }],
      });
      const formulaNodes = graph.nodes.filter((n) => n.atom_type === 'formula_eval');
      expect(formulaNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('所有难度为 0 时不应生成 formula_eval 节点', () => {
      const { graph } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'roll_under',
        difficulty_levels: [{ name: '普通', threshold: 0 }],
      });
      const formulaNodes = graph.nodes.filter((n) => n.atom_type === 'formula_eval');
      expect(formulaNodes.length).toBe(0);
    });
  });

  describe('roll_over 模式', () => {
    it('主 threshold_compare 的 mode 应为 greater_than', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_over' });
      const diceNode = graph.nodes.find((n) => n.atom_type === 'dice_roll')!;
      const mainCmp = graph.nodes.find(
        (n) =>
          n.atom_type === 'threshold_compare' &&
          (n.inputs.value as any)?.node_id === diceNode.node_id,
      )!;
      expect((mainCmp.inputs.mode as any).value).toBe('greater_than');
    });

    it('节点总数应与 roll_under 模式一致', () => {
      const { graph: g1 } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under', difficulty_levels: [{ name: '普通', threshold: 0 }] });
      const { graph: g2 } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_over', difficulty_levels: [{ name: '普通', threshold: 0 }] });
      expect(g1.nodes.length).toBe(g2.nodes.length);
    });
  });

  describe('dice_pool 模式', () => {
    it('应生成 dice_roll + formula_eval + threshold_compare + result_collector 共 4 个节点', () => {
      const { graph } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'dice_pool',
        default_dice: '5d6',
        dice_pool_success_threshold: 5,
        dice_pool_target: 2,
      });
      expect(graph.nodes.length).toBe(4);
      expect(graph.nodes.filter((n) => n.atom_type === 'dice_roll').length).toBe(1);
      expect(graph.nodes.filter((n) => n.atom_type === 'formula_eval').length).toBe(1);
      expect(graph.nodes.filter((n) => n.atom_type === 'threshold_compare').length).toBe(1);
      expect(graph.nodes.filter((n) => n.atom_type === 'result_collector').length).toBe(1);
    });

    it('formula_eval 公式应包含 countSuccesses 和阈值', () => {
      const { graph } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'dice_pool',
        default_dice: '5d6',
        dice_pool_success_threshold: 4,
        dice_pool_target: 2,
      });
      const fNode = graph.nodes.find((n) => n.atom_type === 'formula_eval')!;
      expect((fNode.inputs.formula as any).value).toContain('countSuccesses');
      expect((fNode.inputs.formula as any).value).toContain('4');
    });

    it('threshold_compare 的阈值应等于 dice_pool_target', () => {
      const { graph } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'dice_pool',
        default_dice: '4d6',
        dice_pool_success_threshold: 5,
        dice_pool_target: 3,
      });
      const cmpNode = graph.nodes.find((n) => n.atom_type === 'threshold_compare')!;
      expect((cmpNode.inputs.threshold as any).value).toBe(3);
    });

    it('缺少 dice_pool_success_threshold 时应使用默认值 5，并在 used_defaults 中标记', () => {
      const { graph, used_defaults } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'dice_pool',
        // 故意不提供 dice_pool_success_threshold
      });
      expect(used_defaults).toContain('dice_pool_success_threshold');
      const fNode = graph.nodes.find((n) => n.atom_type === 'formula_eval')!;
      expect((fNode.inputs.formula as any).value).toContain('5');
    });

    it('缺少 dice_pool_target 时应使用默认值 1，并在 used_defaults 中标记', () => {
      const { used_defaults } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'dice_pool',
        // 故意不提供 dice_pool_target
      });
      expect(used_defaults).toContain('dice_pool_target');
    });

    it('连线：formula_eval 应连接 dice_roll 的 result 输出', () => {
      const { graph } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'dice_pool',
        default_dice: '5d6',
        dice_pool_success_threshold: 5,
        dice_pool_target: 2,
      });
      const diceId = graph.nodes.find((n) => n.atom_type === 'dice_roll')!.node_id;
      const fNode = graph.nodes.find((n) => n.atom_type === 'formula_eval')!;
      const diceInput = fNode.inputs['dice'] as any;
      expect(diceInput.type).toBe('ref');
      expect(diceInput.node_id).toBe(diceId);
    });
  });

  describe('布局坐标', () => {
    it('每个节点都应有布局信息', () => {
      const { graph, layout } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under', difficulty_levels: [] });
      expect(layout.length).toBe(graph.nodes.length);
      layout.forEach((p) => {
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
      });
    });
  });
});
