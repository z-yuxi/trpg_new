import type { GraphDef } from './executor';

/** 命令定义（含可选的位置参数映射） */
export interface CommandDef {
  description: string;
  graph: GraphDef;
  /**
   * 将位置参数（arg0, arg1, ...）映射到具名图输入键。
   * 例如 [{ positional: 0, key: 'field_name' }] 会把 arg0 的值注入为 field_name。
   */
  param_map?: Array<{ positional: number; key: string }>;
}

/** 通用命令键（不依赖规则集，始终可用） */
export const GENERAL_COMMAND_KEYS = ['r', 'rh', 'nn'] as const;

/** 平台预置检定命令键 */
export const PRESET_COMMAND_KEYS = [
  'roll', 'check', 'initiative',
  'ra', 'rc', 'sc', 'en', 'ti', 'li', 'init', 'ds',
] as const;

/** 平台默认命令定义 */
export const DEFAULT_COMMANDS: Record<string, CommandDef> = {
  // ── 通用命令（始终可用）─────────────────────────────────────────
  roll: {
    description: '投掷骰子',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d20' } } },
      ],
      output_node_id: 'dice',
    },
  },
  r: {
    description: '通用掷骰（/r 2d6）',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d20' } } },
      ],
      output_node_id: 'dice',
    },
  },
  rh: {
    description: '暗骰（结果仅 GM 可见）',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d20' } } },
      ],
      output_node_id: 'dice',
    },
  },
  nn: {
    description: '旁白（系统旁白消息）',
    graph: {
      nodes: [
        {
          node_id: 'out',
          atom_type: 'result_collector',
          inputs: { entries: { type: 'static', value: { type: 'narrative' } } },
        },
      ],
      output_node_id: 'out',
    },
  },

  // ── 平台预置检定命令 ─────────────────────────────────────────────
  check: {
    description: '技能检定（1d100 ≤ 阈值）',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'static', value: 50 },
            operator: { type: 'static', value: '<=' },
          },
        },
      ],
      output_node_id: 'cmp',
    },
  },
  initiative: {
    description: '先攻掷骰',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d20' } } },
      ],
      output_node_id: 'dice',
    },
  },

  /** ra：技能检定（1d100 ≤ 技能值），需角色数据；/ra 侦查 */
  ra: {
    description: '技能检定（1d100 ≤ 技能值）',
    param_map: [{ positional: 0, key: 'field_name' }],
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'reader',
          atom_type: 'character_skill_reader',
          inputs: {
            character_data: { type: 'static', value: null },   // 运行时注入
            field_type: { type: 'static', value: 'skill' },
            field_name: { type: 'static', value: '' },         // 由 param_map / params 注入
          },
        },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'ref', node_id: 'reader', output_key: 'value' },
            operator: { type: 'static', value: '<=' },
          },
        },
      ],
      output_node_id: 'cmp',
    },
  },

  /** rc：属性检定（1d100 ≤ 属性值），需角色数据；/rc 力量 */
  rc: {
    description: '属性检定（1d100 ≤ 属性值）',
    param_map: [{ positional: 0, key: 'field_name' }],
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'reader',
          atom_type: 'character_skill_reader',
          inputs: {
            character_data: { type: 'static', value: null },
            field_type: { type: 'static', value: 'attribute' },
            field_name: { type: 'static', value: '' },
          },
        },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'ref', node_id: 'reader', output_key: 'value' },
            operator: { type: 'static', value: '<=' },
          },
        },
      ],
      output_node_id: 'cmp',
    },
  },

  /** sc：理智检定（1d100 ≤ 当前理智值），需角色数据 */
  sc: {
    description: '理智检定（1d100 ≤ 当前理智值）',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'reader',
          atom_type: 'character_skill_reader',
          inputs: {
            character_data: { type: 'static', value: null },
            field_type: { type: 'static', value: 'resource_current' },
            field_name: { type: 'static', value: '理智值' },
          },
        },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'ref', node_id: 'reader', output_key: 'value' },
            operator: { type: 'static', value: '<=' },
          },
        },
      ],
      output_node_id: 'cmp',
    },
  },

  /** en：成长检定（1d100 > 技能值则成长），需角色数据；/en 侦查 */
  en: {
    description: '成长检定（1d100 > 技能值时，技能成长 1d10）',
    param_map: [{ positional: 0, key: 'field_name' }],
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'reader',
          atom_type: 'character_skill_reader',
          inputs: {
            character_data: { type: 'static', value: null },
            field_type: { type: 'static', value: 'skill' },
            field_name: { type: 'static', value: '' },
          },
        },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'ref', node_id: 'reader', output_key: 'value' },
            operator: { type: 'static', value: '>' },
          },
        },
        // 成长骰（结果记录在 log，后续可用于角色成长更新）
        { node_id: 'growth', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d10' } } },
      ],
      output_node_id: 'cmp',
    },
  },

  /** ti：临时疯狂检定（temporary insanity，基于当前理智值） */
  ti: {
    description: '临时疯狂检定（1d100 ≤ 当前理智值）',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
        {
          node_id: 'reader',
          atom_type: 'character_skill_reader',
          inputs: {
            character_data: { type: 'static', value: null },
            field_type: { type: 'static', value: 'resource_current' },
            field_name: { type: 'static', value: '理智值' },
          },
        },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'ref', node_id: 'reader', output_key: 'value' },
            operator: { type: 'static', value: '<=' },
          },
        },
      ],
      output_node_id: 'cmp',
    },
  },

  /** li：总结疯狂症状（lasting insanity） */
  li: {
    description: '总结疯狂症状（1d10 抽取）',
    graph: {
      nodes: [
        {
          node_id: 'symptom',
          atom_type: 'random_table',
          inputs: {
            roll_expression: { type: 'static', value: '1d10' },
            table_entries: {
              type: 'static',
              value: [
                { weight: 1, value: '失忆' },
                { weight: 1, value: '偏执' },
                { weight: 1, value: '暴力冲动' },
                { weight: 1, value: '幻觉' },
                { weight: 1, value: '恐惧症' },
                { weight: 1, value: '躁狂' },
                { weight: 1, value: '抑郁' },
                { weight: 1, value: '强迫行为' },
                { weight: 1, value: '人格分离' },
                { weight: 1, value: '逃避现实' },
              ],
            },
          },
        },
      ],
      output_node_id: 'symptom',
    },
  },

  /** init：先攻（同 initiative 的短别名） */
  init: {
    description: '先攻（1d20）',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d20' } } },
      ],
      output_node_id: 'dice',
    },
  },

  /** ds：死亡豁免（1d20 ≥ 10 则成功） */
  ds: {
    description: '死亡豁免（1d20 ≥ 10 则成功）',
    graph: {
      nodes: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d20' } } },
        {
          node_id: 'cmp',
          atom_type: 'threshold_compare',
          inputs: {
            value: { type: 'ref', node_id: 'dice', output_key: 'total' },
            threshold: { type: 'static', value: 10 },
            operator: { type: 'static', value: '>=' },
          },
        },
      ],
      output_node_id: 'cmp',
    },
  },
};
