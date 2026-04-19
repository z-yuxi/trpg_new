/**
 * l3-to-l1-detector.test.ts
 * 测试 L3 → L1 反向检测器：标准图匹配，自定义图返回 l3-only
 */
import { describe, it, expect } from 'vitest';
import { detectL3ToL1 } from '../utils/l3-to-l1-detector';
import { convertL1ToL3 } from '../utils/l1-to-l3-converter';
import type { CommandGraph } from '@trpg/shared';
import type { L1Config } from '../utils/l1-to-l3-converter';

const BASE_L1: L1Config = {
  check_mode: 'roll_under',
  default_dice: '1d100',
  success_formula: 'roll <= skill',
  crit_success_max: 5,
  crit_fail_min: 96,
  bonus_dice: '',
  difficulty_levels: [{ name: '普通', threshold: 0 }],
  resources: [],
  attributes: [],
  supported_commands: ['roll'],
};

describe('detectL3ToL1', () => {
  it('空图应返回 matched=false, reason=empty-graph', () => {
    const result = detectL3ToL1({ nodes: [], output_node_id: '' });
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.reason).toBe('empty-graph');
    }
  });

  it('包含 resource_modify 节点的图应返回 l3-only', () => {
    const graph: CommandGraph = {
      nodes: [
        {
          node_id: 'n1',
          atom_type: 'dice_roll',
          inputs: { expression: { type: 'static', value: '1d100' } },
        },
        {
          node_id: 'n2',
          atom_type: 'resource_modify', // 不在 L1 允许列表中
          inputs: {
            resource_name: { type: 'static', value: 'HP' },
            delta: { type: 'ref', node_id: 'n1', output_key: 'result' },
          },
        },
      ],
      output_node_id: 'n2',
    };
    const result = detectL3ToL1(graph);
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.reason).toBe('l3-only');
    }
  });

  it('包含 if_else 节点的图应返回 l3-only', () => {
    const graph: CommandGraph = {
      nodes: [
        { node_id: 'n1', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'n2',
          atom_type: 'if_else',
          inputs: {
            condition: { type: 'ref', node_id: 'n1', output_key: 'result' },
            if_true: { type: 'static', value: '成功' },
            if_false: { type: 'static', value: '失败' },
          },
        },
        { node_id: 'n3', atom_type: 'result_collector', inputs: { entries: { type: 'ref', node_id: 'n2', output_key: 'result' } } },
      ],
      output_node_id: 'n3',
    };
    const result = detectL3ToL1(graph);
    expect(result.matched).toBe(false);
  });

  describe('roll_under 标准图反向匹配', () => {
    it('convertL1ToL3 生成的 roll_under 图应能识别为 roll_under', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under' });
      const result = detectL3ToL1(graph);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.check_mode).toBe('roll_under');
        expect(result.extracted.default_dice).toBe('1d100');
      }
    });

    it('应提取 crit_success_max 和 crit_fail_min', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_under', crit_success_max: 3, crit_fail_min: 98 });
      const result = detectL3ToL1(graph);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.extracted.crit_success_max).toBe(3);
        expect(result.extracted.crit_fail_min).toBe(98);
      }
    });
  });

  describe('roll_over 标准图反向匹配', () => {
    it('convertL1ToL3 生成的 roll_over 图应能识别为 roll_over', () => {
      const { graph } = convertL1ToL3({ ...BASE_L1, check_mode: 'roll_over' });
      const result = detectL3ToL1(graph);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.check_mode).toBe('roll_over');
      }
    });
  });

  describe('dice_pool 标准图反向匹配', () => {
    it('convertL1ToL3 生成的 dice_pool 图应能识别为 dice_pool', () => {
      const { graph } = convertL1ToL3({
        ...BASE_L1,
        check_mode: 'dice_pool',
        default_dice: '5d6',
        dice_pool_success_threshold: 4,
        dice_pool_target: 2,
      });
      const result = detectL3ToL1(graph);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.check_mode).toBe('dice_pool');
        expect(result.extracted.dice_pool_success_threshold).toBe(4);
        expect(result.extracted.dice_pool_target).toBe(2);
      }
    });
  });

  it('仅包含 dice_roll 无 result_collector 时应返回 l3-only', () => {
    const graph: CommandGraph = {
      nodes: [{ node_id: 'n1', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d6' } } }],
      output_node_id: 'n1',
    };
    const result = detectL3ToL1(graph);
    expect(result.matched).toBe(false);
  });
});
