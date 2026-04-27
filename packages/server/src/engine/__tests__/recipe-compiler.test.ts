/**
 * 阶段2 — Recipe 校验器 + 编译器单测
 *
 * 覆盖点：
 * 1. threshold_check  编译成功 + 缺字段 + 空 tiers 失败用例
 * 2. resource_modify  编译成功 + 缺字段 + 非法 mode 失败用例
 * 3. chain            编译成功 + 非法嵌套 + 无效引用失败用例
 * 4. raw              编译成功 + 缺 output_atom_id 失败用例
 * 5. 未知 type         校验失败
 * 6. 编译产物能被 GraphExecutor 实际执行（集成测试）
 */
import { describe, it, expect } from 'vitest';
import type { Recipe, ThresholdCheckParams, ResourceModifyParams, ChainParams, RawRecipeParams } from '@trpg/shared';
import {
  validateRecipe,
  compileRecipe,
  validateRecipeSource,
} from '../recipe-compiler';
import { GraphExecutor } from '../executor';
import { globalRegistry } from '../registry';

// ─── Fixture ─────────────────────────────────────────────────────────────────

const COC_THRESHOLD: Recipe = {
  id: 'coc7_skill_check',
  type: 'threshold_check',
  name: 'COC7版技能检定',
  params: {
    dice_expression: '1d100',
    target_source: 'skill',
    target_ref: '侦查',
    success_direction: 'lte',
    difficulty: { mode: 'divisor', divisors: [1, 2, 5], default_level: 0 },
    tiers: [
      { name: 'critical', label: '大成功', condition: 'roll == 1', is_success: true },
      { name: 'success', label: '成功', condition: 'roll <= target', is_success: true },
      { name: 'fail', label: '失败', condition: 'true', is_success: false },
    ],
  } as ThresholdCheckParams,
};

const RESOURCE_MODIFY_DICE: Recipe = {
  id: 'damage_apply',
  type: 'resource_modify',
  name: '伤害应用',
  params: {
    resource_ref: 'hp',
    delta: { mode: 'dice', expression: '1d6+2' },
    direction: 'decrease',
    clamp_min: 'zero',
  } as ResourceModifyParams,
};

const RESOURCE_MODIFY_FIXED: Recipe = {
  id: 'heal_apply',
  type: 'resource_modify',
  name: '治疗应用',
  params: {
    resource_ref: 'hp',
    delta: { mode: 'fixed', value: 5 },
    direction: 'increase',
  } as ResourceModifyParams,
};

// ─── 1. threshold_check ───────────────────────────────────────────────────────

describe('threshold_check', () => {
  it('校验合法 COC 技能检定通过', () => {
    const r = validateRecipe(COC_THRESHOLD);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('编译产生有效 GraphDef', () => {
    const r = compileRecipe(COC_THRESHOLD);
    expect(r.success).toBe(true);
    expect(r.graph).toBeDefined();
    expect(r.graph!.nodes.length).toBeGreaterThan(0);
    expect(r.graph!.output_node_id).toContain('output');
  });

  it('编译图包含 dice_roll / threshold_compare / result_collector 节点', () => {
    const r = compileRecipe(COC_THRESHOLD);
    const types = r.graph!.nodes.map((n) => n.atom_type);
    expect(types).toContain('dice_roll');
    expect(types).toContain('threshold_compare');
    expect(types).toContain('result_collector');
  });

  it('缺 dice_expression 时校验失败', () => {
    const bad: Recipe = {
      ...COC_THRESHOLD,
      id: 'bad_threshold',
      params: { ...(COC_THRESHOLD.params as ThresholdCheckParams), dice_expression: '' },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    const paths = r.errors.map((e) => e.path);
    expect(paths.some((p) => p.includes('dice_expression'))).toBe(true);
  });

  it('tiers 为空数组时校验失败', () => {
    const bad: Recipe = {
      ...COC_THRESHOLD,
      id: 'bad_threshold_2',
      params: { ...(COC_THRESHOLD.params as ThresholdCheckParams), tiers: [] },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'EMPTY_TIERS')).toBe(true);
  });

  it('target_source=skill 时缺 target_ref 校验失败', () => {
    const bad: Recipe = {
      ...COC_THRESHOLD,
      id: 'bad_threshold_3',
      params: { ...(COC_THRESHOLD.params as ThresholdCheckParams), target_ref: undefined },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('target_ref'))).toBe(true);
  });

  it('target_source=fixed 时缺 target_fixed 校验失败', () => {
    const bad: Recipe = {
      ...COC_THRESHOLD,
      id: 'bad_threshold_4',
      params: {
        ...(COC_THRESHOLD.params as ThresholdCheckParams),
        target_source: 'fixed',
        target_ref: undefined,
        target_fixed: undefined,
      },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('target_fixed'))).toBe(true);
  });
});

// ─── 2. resource_modify ───────────────────────────────────────────────────────

describe('resource_modify', () => {
  it('校验 dice 模式伤害通过', () => {
    expect(validateRecipe(RESOURCE_MODIFY_DICE).valid).toBe(true);
  });

  it('校验 fixed 模式治疗通过', () => {
    expect(validateRecipe(RESOURCE_MODIFY_FIXED).valid).toBe(true);
  });

  it('编译 dice 模式图包含 dice_roll 节点', () => {
    const r = compileRecipe(RESOURCE_MODIFY_DICE);
    expect(r.success).toBe(true);
    const types = r.graph!.nodes.map((n) => n.atom_type);
    expect(types).toContain('dice_roll');
    expect(types).toContain('resource_modify');
  });

  it('编译 fixed 模式图包含 result_collector 做 delta 占位', () => {
    const r = compileRecipe(RESOURCE_MODIFY_FIXED);
    expect(r.success).toBe(true);
    const types = r.graph!.nodes.map((n) => n.atom_type);
    expect(types).toContain('result_collector');
    expect(types).toContain('resource_modify');
  });

  it('缺 resource_ref 时校验失败', () => {
    const bad: Recipe = {
      ...RESOURCE_MODIFY_DICE,
      id: 'bad_rm',
      params: { ...(RESOURCE_MODIFY_DICE.params as ResourceModifyParams), resource_ref: '' },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('resource_ref'))).toBe(true);
  });

  it('delta.mode=dice 时缺 expression 校验失败', () => {
    const bad: Recipe = {
      ...RESOURCE_MODIFY_DICE,
      id: 'bad_rm_2',
      params: {
        ...(RESOURCE_MODIFY_DICE.params as ResourceModifyParams),
        delta: { mode: 'dice', expression: undefined },
      },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('delta.expression'))).toBe(true);
  });

  it('delta.mode=fixed 时缺 value 校验失败', () => {
    const bad: Recipe = {
      ...RESOURCE_MODIFY_FIXED,
      id: 'bad_rm_3',
      params: {
        ...(RESOURCE_MODIFY_FIXED.params as ResourceModifyParams),
        delta: { mode: 'fixed', value: undefined },
      },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('delta.value'))).toBe(true);
  });

  it('非法 direction 校验失败', () => {
    const bad: Recipe = {
      ...RESOURCE_MODIFY_DICE,
      id: 'bad_rm_4',
      params: {
        ...(RESOURCE_MODIFY_DICE.params as ResourceModifyParams),
        direction: 'invalid' as unknown as 'decrease' | 'increase',
      },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('direction'))).toBe(true);
  });
});

// ─── 3. chain ─────────────────────────────────────────────────────────────────

describe('chain', () => {
  const allRecipes: Recipe[] = [COC_THRESHOLD, RESOURCE_MODIFY_DICE];

  const CHAIN_SAN: Recipe = {
    id: 'coc7_san_check',
    type: 'chain',
    name: 'COC7版理智检定',
    params: {
      steps: [
        { step_id: 'check', recipe_ref: 'coc7_skill_check' },
        {
          step_id: 'loss',
          recipe_ref: 'damage_apply',
          condition: { depends_on: 'check', when: 'failure' },
        },
      ],
    } as ChainParams,
  };

  it('校验合法 chain 通过', () => {
    const r = validateRecipe(CHAIN_SAN, allRecipes);
    expect(r.valid).toBe(true);
  });

  it('编译合法 chain 产出 GraphDef', () => {
    const r = compileRecipe(CHAIN_SAN, allRecipes);
    expect(r.success).toBe(true);
    expect(r.graph).toBeDefined();
    // 应包含来自两个子 recipe 的节点（用 step prefix）
    expect(r.graph!.nodes.length).toBeGreaterThan(2);
  });

  it('chain 步骤引用另一个 chain 时，校验失败（INVALID_CHAIN_NESTING）', () => {
    const nestedChain: Recipe = {
      id: 'inner_chain',
      type: 'chain',
      name: '内层 chain',
      params: { steps: [{ step_id: 's1', recipe_ref: 'coc7_skill_check' }] } as ChainParams,
    };
    const outerChain: Recipe = {
      id: 'outer_chain',
      type: 'chain',
      name: '外层 chain',
      params: {
        steps: [{ step_id: 'nested', recipe_ref: 'inner_chain' }],
      } as ChainParams,
    };
    const r = validateRecipe(outerChain, [COC_THRESHOLD, nestedChain]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'INVALID_CHAIN_NESTING')).toBe(true);
  });

  it('chain 步骤引用不存在的 recipe 时，校验失败（INVALID_REFERENCE）', () => {
    const bad: Recipe = {
      id: 'bad_chain',
      type: 'chain',
      name: '坏 chain',
      params: {
        steps: [{ step_id: 's1', recipe_ref: 'nonexistent_recipe_xyz' }],
      } as ChainParams,
    };
    const r = validateRecipe(bad, allRecipes);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'INVALID_REFERENCE')).toBe(true);
  });

  it('chain steps 为空时校验失败', () => {
    const bad: Recipe = {
      id: 'empty_chain',
      type: 'chain',
      name: '空 chain',
      params: { steps: [] } as ChainParams,
    };
    const r = validateRecipe(bad, allRecipes);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('steps'))).toBe(true);
  });

  it('condition.when=expression 时缺 expression 字段，校验失败', () => {
    const bad: Recipe = {
      id: 'bad_chain_cond',
      type: 'chain',
      name: '坏条件 chain',
      params: {
        steps: [{
          step_id: 's1',
          recipe_ref: 'coc7_skill_check',
          condition: { depends_on: 's0', when: 'expression', expression: undefined },
        }],
      } as ChainParams,
    };
    const r = validateRecipe(bad, allRecipes);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('expression'))).toBe(true);
  });
});

// ─── 4. raw ───────────────────────────────────────────────────────────────────

describe('raw', () => {
  const RAW_RECIPE: Recipe = {
    id: 'raw_roll',
    type: 'raw',
    name: 'Raw 骰子',
    params: {
      atoms: [
        { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d20' } } },
        { node_id: 'out', atom_type: 'result_collector', inputs: { entries: { type: 'static', value: {} } } },
      ],
      connections: [],
      entry_atom_id: 'dice',
      output_atom_id: 'out',
    } as RawRecipeParams,
  };

  it('校验合法 raw recipe 通过', () => {
    expect(validateRecipe(RAW_RECIPE).valid).toBe(true);
  });

  it('编译 raw recipe 直接透传为 GraphDef', () => {
    const r = compileRecipe(RAW_RECIPE);
    expect(r.success).toBe(true);
    expect(r.graph!.output_node_id).toBe('out');
    expect(r.graph!.nodes).toHaveLength(2);
  });

  it('缺 output_atom_id 时校验失败（MISSING_OUTPUT）', () => {
    const bad: Recipe = {
      ...RAW_RECIPE,
      id: 'bad_raw',
      params: { ...(RAW_RECIPE.params as RawRecipeParams), output_atom_id: '' },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'MISSING_OUTPUT')).toBe(true);
  });

  it('atoms 为空时校验失败', () => {
    const bad: Recipe = {
      ...RAW_RECIPE,
      id: 'bad_raw_2',
      params: { ...(RAW_RECIPE.params as RawRecipeParams), atoms: [] },
    };
    const r = validateRecipe(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path.includes('atoms'))).toBe(true);
  });
});

// ─── 5. 未知 type ─────────────────────────────────────────────────────────────

describe('未知 recipe 类型', () => {
  it('type=unsupported_xyz 时校验失败（UNKNOWN_RECIPE_TYPE）', () => {
    const bad = {
      id: 'bad_type',
      type: 'unsupported_xyz' as unknown as import('@trpg/shared').RecipeType,
      name: '未知类型',
      params: {},
    };
    const r = validateRecipe(bad as Recipe);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'UNKNOWN_RECIPE_TYPE')).toBe(true);
  });
});

// ─── 6. validateRecipeSource（多 recipe 批量校验）────────────────────────────

describe('validateRecipeSource', () => {
  it('全部合法 recipe 时返回空 Map', () => {
    const result = validateRecipeSource({
      recipes: [COC_THRESHOLD, RESOURCE_MODIFY_DICE],
    });
    expect(result.size).toBe(0);
  });

  it('有一个非法 recipe 时，Map 中包含对应 id', () => {
    const badRecipe: Recipe = {
      id: 'bad_one',
      type: 'threshold_check',
      name: '坏的',
      params: { dice_expression: '', tiers: [] } as unknown as ThresholdCheckParams,
    };
    const result = validateRecipeSource({
      recipes: [COC_THRESHOLD, badRecipe],
    });
    expect(result.has('bad_one')).toBe(true);
    expect(result.has('coc7_skill_check')).toBe(false);
  });
});

// ─── 7. 编译产物 GraphDef → GraphExecutor 集成执行 ────────────────────────────

describe('编译产物集成执行', () => {
  const executor = new GraphExecutor(globalRegistry);

  it('threshold_check 编译产物可被 GraphExecutor 执行（fixed target）', () => {
    const recipe: Recipe = {
      id: 'dnd_check',
      type: 'threshold_check',
      name: 'DND 检定',
      params: {
        dice_expression: '1d20',
        target_source: 'fixed',
        target_fixed: 10,
        success_direction: 'gte',
        tiers: [
          { name: 'success', label: '成功', condition: 'roll >= target', is_success: true },
          { name: 'fail', label: '失败', condition: 'true', is_success: false },
        ],
      } as ThresholdCheckParams,
    };

    const compiled = compileRecipe(recipe);
    expect(compiled.success).toBe(true);
    const result = executor.execute(compiled.graph!);
    // 执行应能完成（success 或 fail 都可以，关键是不崩溃）
    expect(result.logs.length).toBeGreaterThan(0);
    // 输出节点应存在
    expect(result.output).toBeDefined();
  });

  it('resource_modify（fixed decrease）编译产物可被执行', () => {
    const compiled = compileRecipe(RESOURCE_MODIFY_FIXED);
    expect(compiled.success).toBe(true);
    // 注入 current_value / max_value（static 占位值需覆盖为有意义的值）
    const graph = compiled.graph!;
    // 找 resource_modify 节点，注入真实值
    const rmNode = graph.nodes.find((n) => n.atom_type === 'resource_modify')!;
    rmNode.inputs['current_value'] = { type: 'static', value: 10 };
    rmNode.inputs['max_value'] = { type: 'static', value: 10 };

    const result = executor.execute(graph);
    expect(result.success).toBe(true);
    // new_value 应为 10+5=15 但会 clamp 到 max=10
    const rmLog = result.logs.find((l) => l.node_type === 'resource_modify');
    expect(rmLog).toBeDefined();
    expect(rmLog!.status).toBe('success');
  });

  it('raw 编译产物可被 GraphExecutor 执行', () => {
    const rawRecipe: Recipe = {
      id: 'raw_d6',
      type: 'raw',
      name: '1d6 骰子',
      params: {
        atoms: [
          { node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d6' } } },
          { node_id: 'out', atom_type: 'result_collector', inputs: { entries: { type: 'static', value: { type: 'roll' } } } },
        ],
        connections: [],
        entry_atom_id: 'dice',
        output_atom_id: 'out',
      } as RawRecipeParams,
    };
    const compiled = compileRecipe(rawRecipe);
    expect(compiled.success).toBe(true);
    const result = executor.execute(compiled.graph!);
    expect(result.logs.length).toBeGreaterThan(0);
  });
});
