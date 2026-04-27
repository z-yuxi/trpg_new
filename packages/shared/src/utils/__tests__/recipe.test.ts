/**
 * 阶段1 单测：Recipe 类型结构 + Legacy 标记
 */
import { describe, it, expect } from 'vitest';
import type {
  Recipe,
  ThresholdCheckParams,
  ResourceModifyParams,
  ChainParams,
  RawRecipeParams,
  RulesetRecipeSource,
} from '../../types/recipe';
import {
  wrapLegacyGraphAsRawRecipe,
  buildLegacyRecipeSource,
  isLegacyRuleset,
} from '../recipe-migration';

// ─── 基础 Recipe 结构 ────────────────────────────────────────────────────────

describe('Recipe 基础结构', () => {
  it('threshold_check recipe 应满足最小结构', () => {
    const params: ThresholdCheckParams = {
      dice_expression: '1d100',
      target_source: 'skill',
      target_ref: '侦查',
      success_direction: 'lte',
      tiers: [
        { name: 'success', label: '成功', condition: 'roll <= target', is_success: true },
        { name: 'fail', label: '失败', condition: 'true', is_success: false },
      ],
    };
    const recipe: Recipe = {
      id: 'coc7_skill_check',
      type: 'threshold_check',
      name: 'COC7版技能检定',
      params,
    };
    expect(recipe.id).toBe('coc7_skill_check');
    expect(recipe.type).toBe('threshold_check');
    expect((recipe.params as ThresholdCheckParams).tiers).toHaveLength(2);
  });

  it('resource_modify recipe 应满足最小结构', () => {
    const params: ResourceModifyParams = {
      resource_ref: 'hp',
      delta: { mode: 'dice', expression: '1d6+2' },
      direction: 'decrease',
      clamp_min: 'zero',
    };
    const recipe: Recipe = {
      id: 'damage_apply',
      type: 'resource_modify',
      name: '伤害应用',
      params,
    };
    expect(recipe.type).toBe('resource_modify');
    expect((recipe.params as ResourceModifyParams).resource_ref).toBe('hp');
  });

  it('chain recipe 应满足最小结构，steps 不为空', () => {
    const params: ChainParams = {
      steps: [
        {
          step_id: 'check',
          recipe_ref: 'coc7_skill_check',
          condition: undefined,
        },
        {
          step_id: 'loss',
          recipe_ref: 'san_loss_resource_mod',
          condition: { depends_on: 'check', when: 'failure' },
        },
      ],
    };
    const recipe: Recipe = {
      id: 'coc7_san_check',
      type: 'chain',
      name: 'COC7版理智检定',
      params,
    };
    expect(recipe.type).toBe('chain');
    expect((recipe.params as ChainParams).steps).toHaveLength(2);
  });

  it('raw recipe 应满足最小结构', () => {
    const params: RawRecipeParams = {
      atoms: [{ node_id: 'n1', atom_type: 'dice_roll' }],
      connections: [],
      entry_atom_id: 'n1',
      output_atom_id: 'n1',
    };
    const recipe: Recipe = {
      id: '__legacy__',
      type: 'raw',
      name: '原始图',
      params,
    };
    expect(recipe.type).toBe('raw');
    expect((recipe.params as RawRecipeParams).entry_atom_id).toBe('n1');
  });

  it('RulesetRecipeSource 可包含多个 recipe', () => {
    const source: RulesetRecipeSource = {
      recipes: [
        {
          id: 'r1',
          type: 'threshold_check',
          name: '检定1',
          params: {
            dice_expression: '1d20',
            target_source: 'fixed',
            target_fixed: 15,
            success_direction: 'gte',
            tiers: [{ name: 'success', label: '成功', condition: 'roll >= target', is_success: true }],
          },
        },
      ],
      command_recipe_map: { ra: 'r1' },
    };
    expect(source.recipes).toHaveLength(1);
    expect(source.command_recipe_map?.['ra']).toBe('r1');
  });
});

// ─── Legacy 迁移工具 ─────────────────────────────────────────────────────────

describe('Legacy 迁移工具', () => {
  const sampleAtoms = {
    roll: { type: 'dice_roll' },
    compare: { type: 'threshold_compare' },
  };
  const sampleConnections = [
    { source: 'roll', target: 'compare', sourceHandle: 'result', targetHandle: 'roll' },
  ];

  it('wrapLegacyGraphAsRawRecipe 应产出 raw 类型 recipe', () => {
    const recipe = wrapLegacyGraphAsRawRecipe(sampleAtoms, sampleConnections);
    expect(recipe.type).toBe('raw');
    expect(recipe.id).toBe('__legacy_graph__');
    expect(recipe.tags).toContain('legacy');
  });

  it('wrapLegacyGraphAsRawRecipe 应将 atom map 规范化为数组', () => {
    const recipe = wrapLegacyGraphAsRawRecipe(sampleAtoms, sampleConnections);
    const params = recipe.params as RawRecipeParams;
    expect(Array.isArray(params.atoms)).toBe(true);
    expect(params.atoms).toHaveLength(2);
    // node_id 应被注入
    const ids = params.atoms.map((a) => (a as Record<string, unknown>)['node_id']);
    expect(ids).toContain('roll');
    expect(ids).toContain('compare');
  });

  it('wrapLegacyGraphAsRawRecipe 应自动推断 entry/output 节点', () => {
    const recipe = wrapLegacyGraphAsRawRecipe(sampleAtoms, sampleConnections);
    const params = recipe.params as RawRecipeParams;
    // roll 是根节点（无人指向它），compare 是叶节点（不指向任何人）
    expect(params.entry_atom_id).toBe('roll');
    expect(params.output_atom_id).toBe('compare');
  });

  it('wrapLegacyGraphAsRawRecipe 允许显式覆盖 entry/output', () => {
    const recipe = wrapLegacyGraphAsRawRecipe(sampleAtoms, sampleConnections, 'compare', 'roll');
    const params = recipe.params as RawRecipeParams;
    expect(params.entry_atom_id).toBe('compare');
    expect(params.output_atom_id).toBe('roll');
  });

  it('buildLegacyRecipeSource 应生成含 legacy 标记的完整结果', () => {
    const result = buildLegacyRecipeSource(sampleAtoms, sampleConnections);
    expect(result.legacy).toBe(true);
    expect(result.legacy_meta.origin).toBe('raw_recipe_wrapped');
    expect(result.legacy_meta.migration_status).toBe('pending');
    expect(result.recipe_source.recipes).toHaveLength(1);
    expect(result.recipe_source.recipes[0].type).toBe('raw');
  });

  it('isLegacyRuleset: 无 recipe_source 的规则集视为 legacy', () => {
    expect(isLegacyRuleset({ atoms: {}, connections: {} })).toBe(true);
  });

  it('isLegacyRuleset: 有 recipe_source 的规则集视为新格式', () => {
    expect(isLegacyRuleset({ recipe_source: { recipes: [] } })).toBe(false);
  });

  it('isLegacyRuleset: 显式 legacy=true 优先', () => {
    expect(isLegacyRuleset({ recipe_source: { recipes: [] }, legacy: true })).toBe(true);
  });

  it('isLegacyRuleset: 显式 legacy=false 优先', () => {
    expect(isLegacyRuleset({ atoms: {}, legacy: false })).toBe(false);
  });
});
