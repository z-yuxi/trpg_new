import type { GraphDef } from './executor';

/** 平台默认命令定义 */
export const DEFAULT_COMMANDS: Record<string, { graph: GraphDef; description: string }> = {
  roll: {
    description: '投掷骰子',
    graph: {
      nodes: [
        {
          node_id: 'roll',
          atom_type: 'dice_roll',
          inputs: {
            expression: { type: 'static', value: '1d20' },
          },
        },
        {
          node_id: 'out',
          atom_type: 'result_collector',
          inputs: {
            entries: { type: 'ref', node_id: 'roll', output_key: 'total' },
          },
        },
      ],
      output_node_id: 'out',
    },
  },
  check: {
    description: '技能检定',
    graph: {
      nodes: [
        {
          node_id: 'roll',
          atom_type: 'dice_roll',
          inputs: {
            expression: { type: 'static', value: '1d100' },
          },
        },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'roll', output_key: 'total' },
            threshold: { type: 'static', value: 50 },
            operator: { type: 'static', value: '<=' },
          },
        },
        {
          node_id: 'out',
          atom_type: 'result_collector',
          inputs: {
            entries: { type: 'static', value: { roll: null, passed: null } },
          },
        },
      ],
      output_node_id: 'out',
    },
  },
  initiative: {
    description: '先攻掷骰',
    graph: {
      nodes: [
        {
          node_id: 'roll',
          atom_type: 'dice_roll',
          inputs: {
            expression: { type: 'static', value: '1d20' },
          },
        },
        {
          node_id: 'out',
          atom_type: 'result_collector',
          inputs: {
            entries: { type: 'static', value: {} },
          },
        },
      ],
      output_node_id: 'out',
    },
  },
};
