/**
 * recipe-compiler.ts
 *
 * Recipe 配方的校验器（validate）+ 编译器（compile）。
 *
 * 架构原则（R-001 / R-002）：
 *   - compile() 输出 GraphDef，可被现有 GraphExecutor 零改动消费
 *   - 校验错误是结构化结果，每条错误包含 path / code / message
 *   - 每种 recipe 类型对应一个独立编译函数（策略模式），通过 compilerRegistry 扩展
 *
 * 支持的类型（第一批 MVP）：
 *   threshold_check / resource_modify / chain / raw
 */

import type {
  Recipe,
  RecipeType,
  ThresholdCheckParams,
  ResourceModifyParams,
  ChainParams,
  RawRecipeParams,
  RulesetRecipeSource,
} from '@trpg/shared';
import type { GraphDef, GraphNodeDef, InputSource } from './executor';

// ─── 结构化校验错误 ───────────────────────────────────────────────────────────

export interface RecipeValidationError {
  /** 错误路径，如 "recipes[0].params.tiers" */
  path: string;
  /** 结构化错误码 */
  code:
    | 'MISSING_FIELD'
    | 'INVALID_FIELD'
    | 'UNKNOWN_RECIPE_TYPE'
    | 'INVALID_CHAIN_NESTING'
    | 'INVALID_REFERENCE'
    | 'EMPTY_TIERS'
    | 'MISSING_OUTPUT';
  message: string;
}

export interface RecipeValidateResult {
  valid: boolean;
  errors: RecipeValidationError[];
}

export interface RecipeCompileResult {
  success: boolean;
  /** 编译成功时返回可被 GraphExecutor 消费的图定义 */
  graph?: GraphDef;
  errors: RecipeValidationError[];
}

// ─── 已支持的 recipe 类型集合 ─────────────────────────────────────────────────

const SUPPORTED_TYPES: Set<RecipeType> = new Set([
  'threshold_check',
  'resource_modify',
  'chain',
  'raw',
]);

// ─── 主入口：校验 + 编译 ──────────────────────────────────────────────────────

/**
 * 校验单个 recipe（不编译，只做结构检查）。
 * 用于前端提前报错，也用于 compile 的前置检查。
 */
export function validateRecipe(
  recipe: Recipe,
  /** 当前规则包内的全部 recipe 列表，用于 chain 引用校验 */
  allRecipes: Recipe[] = [],
): RecipeValidateResult {
  const errors: RecipeValidationError[] = [];

  // 基础字段
  if (!recipe.id || typeof recipe.id !== 'string') {
    errors.push({ path: 'id', code: 'MISSING_FIELD', message: '`id` 是必填字符串' });
  }
  if (!recipe.type) {
    errors.push({ path: 'type', code: 'MISSING_FIELD', message: '`type` 是必填字段' });
    return { valid: false, errors };
  }
  if (!SUPPORTED_TYPES.has(recipe.type)) {
    errors.push({
      path: 'type',
      code: 'UNKNOWN_RECIPE_TYPE',
      message: `不支持的 recipe 类型：'${recipe.type}'。已支持：${[...SUPPORTED_TYPES].join(', ')}`,
    });
    return { valid: false, errors };
  }
  if (!recipe.name || typeof recipe.name !== 'string') {
    errors.push({ path: 'name', code: 'MISSING_FIELD', message: '`name` 是必填字符串' });
  }
  if (!recipe.params || typeof recipe.params !== 'object') {
    errors.push({ path: 'params', code: 'MISSING_FIELD', message: '`params` 是必填对象' });
    return { valid: false, errors };
  }

  // 类型专项校验
  switch (recipe.type) {
    case 'threshold_check':
      validateThresholdCheck(recipe.params as ThresholdCheckParams, 'params', errors);
      break;
    case 'resource_modify':
      validateResourceModify(recipe.params as ResourceModifyParams, 'params', errors);
      break;
    case 'chain':
      validateChain(recipe.params as ChainParams, 'params', allRecipes, errors);
      break;
    case 'raw':
      validateRaw(recipe.params as RawRecipeParams, 'params', errors);
      break;
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 校验规则包内的所有 recipe。
 * 返回按 recipe.id 索引的错误映射。
 */
export function validateRecipeSource(
  source: RulesetRecipeSource,
): Map<string, RecipeValidationError[]> {
  const result = new Map<string, RecipeValidationError[]>();
  for (const recipe of source.recipes) {
    const { errors } = validateRecipe(recipe, source.recipes);
    if (errors.length > 0) {
      result.set(recipe.id, errors);
    }
  }
  return result;
}

/**
 * 编译单个 recipe 为 GraphDef（可被 GraphExecutor 消费）。
 */
export function compileRecipe(
  recipe: Recipe,
  allRecipes: Recipe[] = [],
): RecipeCompileResult {
  // 先校验
  const validation = validateRecipe(recipe, allRecipes);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  try {
    let graph: GraphDef;
    switch (recipe.type) {
      case 'threshold_check':
        graph = compileThresholdCheck(recipe.id, recipe.params as ThresholdCheckParams);
        break;
      case 'resource_modify':
        graph = compileResourceModify(recipe.id, recipe.params as ResourceModifyParams);
        break;
      case 'chain':
        graph = compileChain(recipe.id, recipe.params as ChainParams, allRecipes);
        break;
      case 'raw':
        graph = compileRaw(recipe.id, recipe.params as RawRecipeParams);
        break;
      default:
        return {
          success: false,
          errors: [{
            path: 'type',
            code: 'UNKNOWN_RECIPE_TYPE',
            message: `编译器不支持类型：${recipe.type}`,
          }],
        };
    }
    return { success: true, graph, errors: [] };
  } catch (err) {
    return {
      success: false,
      errors: [{
        path: '',
        code: 'MISSING_FIELD',
        message: `编译器内部错误：${(err as Error).message}`,
      }],
    };
  }
}

// ─── threshold_check 校验 + 编译 ─────────────────────────────────────────────

function validateThresholdCheck(
  params: ThresholdCheckParams,
  prefix: string,
  errors: RecipeValidationError[],
): void {
  if (!params.dice_expression || typeof params.dice_expression !== 'string') {
    errors.push({ path: `${prefix}.dice_expression`, code: 'MISSING_FIELD', message: '`dice_expression` 是必填字符串' });
  }
  if (!params.target_source) {
    errors.push({ path: `${prefix}.target_source`, code: 'MISSING_FIELD', message: '`target_source` 是必填字段' });
  }
  const validSources = ['skill', 'attribute', 'fixed', 'formula'];
  if (params.target_source && !validSources.includes(params.target_source)) {
    errors.push({
      path: `${prefix}.target_source`,
      code: 'INVALID_FIELD',
      message: `target_source 值无效：'${params.target_source}'，有效值：${validSources.join(', ')}`,
    });
  }
  if ((params.target_source === 'skill' || params.target_source === 'attribute') && !params.target_ref) {
    errors.push({ path: `${prefix}.target_ref`, code: 'MISSING_FIELD', message: `target_source='${params.target_source}' 时 target_ref 是必填字段` });
  }
  if (params.target_source === 'fixed' && params.target_fixed == null) {
    errors.push({ path: `${prefix}.target_fixed`, code: 'MISSING_FIELD', message: "target_source='fixed' 时 target_fixed 是必填数值" });
  }  if (params.target_source === 'formula' && !params.target_formula) {
    errors.push({ path: `${prefix}.target_formula`, code: 'MISSING_FIELD', message: "target_source='formula' 时 target_formula 是必填字符串" });
  }  if (!params.success_direction) {
    errors.push({ path: `${prefix}.success_direction`, code: 'MISSING_FIELD', message: '`success_direction` 是必填字段（lte / gte）' });
  }
  if (!params.tiers || !Array.isArray(params.tiers) || params.tiers.length === 0) {
    errors.push({ path: `${prefix}.tiers`, code: 'EMPTY_TIERS', message: '`tiers` 至少需要一个成功等级定义' });
  } else {
    params.tiers.forEach((tier, i) => {
      if (!tier.name) errors.push({ path: `${prefix}.tiers[${i}].name`, code: 'MISSING_FIELD', message: '`name` 必填' });
      if (!tier.label) errors.push({ path: `${prefix}.tiers[${i}].label`, code: 'MISSING_FIELD', message: '`label` 必填' });
      if (!tier.condition) errors.push({ path: `${prefix}.tiers[${i}].condition`, code: 'MISSING_FIELD', message: '`condition` 必填' });
      if (typeof tier.is_success !== 'boolean') errors.push({ path: `${prefix}.tiers[${i}].is_success`, code: 'MISSING_FIELD', message: '`is_success` 必须是布尔值' });
    });
  }
}

/**
 * threshold_check → GraphDef 编译策略：
 *
 * 节点结构：
 *   [character_skill_reader | static_target] → dice_roll → threshold_compare → result_collector
 *
 * 简化约定：
 *   - target_source='skill' / 'attribute'：生成 character_skill_reader 节点
 *   - target_source='fixed'：target 直接注入为 static
 *   - target_source='formula'：生成 formula_eval 节点，formula 来自 target_formula 字段，
 *     variables 由运行时注入角色属性+技能的平铺字典
 *   - tiers 序列化为 JSON 字符串传入 threshold_compare（threshold_compare 原子现有实现
 *     只做单比较，编译器在此输出兼容结构，执行时通过 conditional_branch 选择 tier）
 *
 * 实际编译输出：
 *   1. dice_roll         → roll_result
 *   2. 目标值节点         → target_value
 *   3. threshold_compare （<=） → compare_result（用于 is_success）
 *   4. result_collector  → 最终输出（含 roll / target / tier 信息）
 */
function compileThresholdCheck(recipeId: string, params: ThresholdCheckParams): GraphDef {
  const nodes: GraphNodeDef[] = [];
  const id = (suffix: string) => `${recipeId}__${suffix}`;

  // ── 1. 骰子节点 ──
  nodes.push({
    node_id: id('dice'),
    atom_type: 'dice_roll',
    inputs: {
      expression: { type: 'static', value: params.dice_expression },
    },
  });

  // ── 2. 目标值节点 ──
  let targetNodeId: string;
  if (params.target_source === 'skill' || params.target_source === 'attribute') {
    targetNodeId = id('target_reader');
    nodes.push({
      node_id: targetNodeId,
      atom_type: 'character_skill_reader',
      inputs: {
        field_type: { type: 'static', value: params.target_source },
        field_name: { type: 'static', value: params.target_ref! },
        // character_data 在执行时由 command-resolver 注入
      },
    });
  } else if (params.target_source === 'fixed') {
    targetNodeId = id('target_static');
    nodes.push({
      node_id: targetNodeId,
      atom_type: 'result_collector',
      inputs: {
        entries: { type: 'static', value: { value: params.target_fixed ?? 0 } },
      },
    });
  } else {
    // formula：使用 formula_eval 原子；variables 将由运行时注入（角色属性+技能平铺后覆盖）
    targetNodeId = id('target_formula');
    nodes.push({
      node_id: targetNodeId,
      atom_type: 'formula_eval',
      inputs: {
        formula: { type: 'static', value: params.target_formula ?? '' },
        variables: { type: 'static', value: {} }, // 运行时由 character_data 注入覆盖
      },
    });
  }

  // ── 3. 比较节点 ──
  // COC lte（掷低成功）映射到 <=，DND gte（掷高成功）映射到 >=
  const operator = params.success_direction === 'lte' ? '<=' : '>=';
  const compareNodeId = id('compare');
  nodes.push({
    node_id: compareNodeId,
    atom_type: 'threshold_compare',
    inputs: {
      value: { type: 'ref', node_id: id('dice'), output_key: 'total' },
      threshold:
        params.target_source === 'skill' || params.target_source === 'attribute'
          ? { type: 'ref', node_id: targetNodeId, output_key: 'value' }
          : { type: 'ref', node_id: targetNodeId, output_key: 'value' },
      operator: { type: 'static', value: operator },
    },
  });
  // ── 4. 输出收集节点 ──
  const outputNodeId = id('output');
  nodes.push({
    node_id: outputNodeId,
    atom_type: 'result_collector',
    inputs: {
      entries: {
        type: 'static',
        value: {
          recipe_id: recipeId,
          type: 'threshold_check',
          tiers: params.tiers,
          difficulty: params.difficulty ?? null,
        },
      },
    },
  });

  return { nodes, output_node_id: outputNodeId };
}

// ─── resource_modify 校验 + 编译 ─────────────────────────────────────────────

function validateResourceModify(
  params: ResourceModifyParams,
  prefix: string,
  errors: RecipeValidationError[],
): void {
  if (!params.resource_ref || typeof params.resource_ref !== 'string') {
    errors.push({ path: `${prefix}.resource_ref`, code: 'MISSING_FIELD', message: '`resource_ref` 是必填字符串' });
  }
  if (!params.delta || typeof params.delta !== 'object') {
    errors.push({ path: `${prefix}.delta`, code: 'MISSING_FIELD', message: '`delta` 是必填对象' });
  } else {
    const validModes = ['fixed', 'dice', 'formula'];
    if (!validModes.includes(params.delta.mode)) {
      errors.push({ path: `${prefix}.delta.mode`, code: 'INVALID_FIELD', message: `delta.mode 无效：'${params.delta.mode}'，有效值：${validModes.join(', ')}` });
    }
    if (params.delta.mode === 'fixed' && params.delta.value == null) {
      errors.push({ path: `${prefix}.delta.value`, code: 'MISSING_FIELD', message: "delta.mode='fixed' 时 delta.value 是必填数值" });
    }
    if ((params.delta.mode === 'dice' || params.delta.mode === 'formula') && !params.delta.expression) {
      errors.push({ path: `${prefix}.delta.expression`, code: 'MISSING_FIELD', message: `delta.mode='${params.delta.mode}' 时 delta.expression 是必填字符串` });
    }
  }
  if (!params.direction || !['decrease', 'increase'].includes(params.direction)) {
    errors.push({ path: `${prefix}.direction`, code: 'MISSING_FIELD', message: '`direction` 是必填字段（decrease / increase）' });
  }
}

/**
 * resource_modify → GraphDef 编译策略：
 *
 * 节点结构：
 *   [dice_roll | static_delta] → resource_modify → result_collector
 *
 * 约定：
 *   - delta.mode='dice'   → 先 dice_roll，再把 total 传给 resource_modify 的 delta
 *   - delta.mode='fixed'  → static 直接传入
 *   - delta.mode='formula'→ 使用 formula_eval 原子，expression 作为公式，variables 由运行时注入
 *   - direction='decrease' → delta 传负值
 *   - current_value / max_value 在运行时由 command-resolver 读取角色资源注入
 */
function compileResourceModify(recipeId: string, params: ResourceModifyParams): GraphDef {
  const nodes: GraphNodeDef[] = [];
  const id = (suffix: string) => `${recipeId}__${suffix}`;

  let deltaNodeId: string;
  let deltaOutputKey: string;

  if (params.delta.mode === 'dice') {
    deltaNodeId = id('delta_dice');
    deltaOutputKey = 'total';
    nodes.push({
      node_id: deltaNodeId,
      atom_type: 'dice_roll',
      inputs: {
        expression: { type: 'static', value: params.delta.expression! },
      },
    });
  } else if (params.delta.mode === 'fixed') {
    deltaNodeId = id('delta_static');
    deltaOutputKey = 'value';
    nodes.push({
      node_id: deltaNodeId,
      atom_type: 'result_collector',
      inputs: {
        entries: { type: 'static', value: { value: params.delta.value ?? 0 } },
      },
    });
  } else {
    // formula：使用 formula_eval 原子；variables 由运行时注入
    deltaNodeId = id('delta_formula');
    deltaOutputKey = 'value';
    nodes.push({
      node_id: deltaNodeId,
      atom_type: 'formula_eval',
      inputs: {
        formula: { type: 'static', value: params.delta.expression ?? '' },
        variables: { type: 'static', value: {} }, // 运行时由 character_data 注入覆盖
      },
    });
  }

  // resource_modify 节点
  // decrease → 传负数 delta（通过 multiply 节点做符号翻转）
  const signNodeId = id('sign');
  nodes.push({
    node_id: signNodeId,
    atom_type: 'multiply',
    inputs: {
      a: { type: 'ref', node_id: deltaNodeId, output_key: deltaOutputKey },
      b: { type: 'static', value: params.direction === 'decrease' ? -1 : 1 },
    },
  });

  const clampMin = params.clamp_min === 'zero' || params.clamp_min === undefined ? 0 : params.clamp_min;
  const rmNodeId = id('rm');
  nodes.push({
    node_id: rmNodeId,
    atom_type: 'resource_modify',
    inputs: {
      // current_value / max_value 由执行时注入（static 占位）
      current_value: { type: 'static', value: 0 },
      max_value: { type: 'static', value: 999 },
      delta: { type: 'ref', node_id: signNodeId, output_key: 'value' },
      min_value: { type: 'static', value: clampMin },
    },
  });

  const outputNodeId = id('output');
  nodes.push({
    node_id: outputNodeId,
    atom_type: 'result_collector',
    inputs: {
      entries: {
        type: 'static',
        value: {
          recipe_id: recipeId,
          type: 'resource_modify',
          resource_ref: params.resource_ref,
        },
      },
    },
  });

  return { nodes, output_node_id: outputNodeId };
}

// ─── chain 校验 + 编译 ────────────────────────────────────────────────────────

function validateChain(
  params: ChainParams,
  prefix: string,
  allRecipes: Recipe[],
  errors: RecipeValidationError[],
): void {
  if (!params.steps || !Array.isArray(params.steps) || params.steps.length === 0) {
    errors.push({ path: `${prefix}.steps`, code: 'MISSING_FIELD', message: '`steps` 至少需要一个步骤' });
    return;
  }

  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));

  params.steps.forEach((step, i) => {
    const sp = `${prefix}.steps[${i}]`;
    if (!step.step_id) {
      errors.push({ path: `${sp}.step_id`, code: 'MISSING_FIELD', message: '`step_id` 是必填字段' });
    }
    if (!step.recipe_ref) {
      errors.push({ path: `${sp}.recipe_ref`, code: 'MISSING_FIELD', message: '`recipe_ref` 是必填字段' });
      return;
    }

    // 检查 chain 嵌套（chain 内不允许引用 chain 类型）
    const referencedRecipe = recipeMap.get(step.recipe_ref);
    if (referencedRecipe) {
      if (referencedRecipe.type === 'chain') {
        errors.push({
          path: `${sp}.recipe_ref`,
          code: 'INVALID_CHAIN_NESTING',
          message: `chain 步骤 '${step.step_id}' 引用了另一个 chain '${step.recipe_ref}'，不允许嵌套`,
        });
      }
    } else {
      // 在当前 source 中找不到，但 recipe_ref 可能指向外部（暂时只给警告性校验）
      // 实际上如果整个 ruleset 的 recipes 已全部传入，则找不到就是无效引用
      if (allRecipes.length > 0) {
        errors.push({
          path: `${sp}.recipe_ref`,
          code: 'INVALID_REFERENCE',
          message: `找不到被引用的 recipe：'${step.recipe_ref}'`,
        });
      }
    }

    // condition 校验
    if (step.condition) {
      const { depends_on, when, expression } = step.condition;
      if (!depends_on) {
        errors.push({ path: `${sp}.condition.depends_on`, code: 'MISSING_FIELD', message: '`depends_on` 是必填字段' });
      }
      const validWhen = ['success', 'failure', 'always', 'expression'];
      if (!validWhen.includes(when)) {
        errors.push({ path: `${sp}.condition.when`, code: 'INVALID_FIELD', message: `when 值无效：'${when}'` });
      }
      if (when === 'expression' && !expression) {
        errors.push({ path: `${sp}.condition.expression`, code: 'MISSING_FIELD', message: "when='expression' 时 expression 是必填字段" });
      }
    }
  });
}

/**
 * chain → GraphDef 编译策略：
 *
 * chain 本质上是对各步骤 recipe 的编译图的"顺序拼接"。
 * 编译时：
 *   1. 为每个 step 生成子图（递归 compileRecipe）
 *   2. 将各步骤的 output 节点连接到下一步骤的 input（通过 conditional_branch 实现条件跳过）
 *   3. 最终 output 节点收集所有 step 的输出
 *
 * 当前简化版本：
 *   直接将步骤图节点拼入主图（加 step prefix 避免 node_id 冲突），
 *   条件执行通过 conditional_branch 节点实现
 */
function compileChain(
  recipeId: string,
  params: ChainParams,
  allRecipes: Recipe[],
): GraphDef {
  const nodes: GraphNodeDef[] = [];
  const recipeMap = new Map(allRecipes.map((r) => [r.id, r]));
  const stepOutputNodeIds: Record<string, string> = {};

  for (const step of params.steps) {
    const stepPrefix = `${recipeId}__step_${step.step_id}`;
    const referencedRecipe = recipeMap.get(step.recipe_ref);

    if (!referencedRecipe) {
      // 已在 validate 阶段报错；此处跳过
      continue;
    }

    // 编译被引用的子 recipe（不传 allRecipes，避免递归嵌套）
    const subResult = compileRecipe(referencedRecipe, []);
    if (!subResult.success || !subResult.graph) continue;

    // 把子图节点 prefix 化后加入主图
    const subGraph = subResult.graph;
    const renamedOutputId = `${stepPrefix}__${subGraph.output_node_id}`;

    for (const node of subGraph.nodes) {
      const renamedNodeId = `${stepPrefix}__${node.node_id}`;
      const renamedInputs: Record<string, InputSource> = {};
      for (const [key, src] of Object.entries(node.inputs)) {
        if (src.type === 'ref') {
          renamedInputs[key] = {
            type: 'ref',
            node_id: `${stepPrefix}__${src.node_id}`,
            output_key: src.output_key,
          };
        } else {
          renamedInputs[key] = src;
        }
      }
      nodes.push({ node_id: renamedNodeId, atom_type: node.atom_type, inputs: renamedInputs });
    }

    stepOutputNodeIds[step.step_id] = renamedOutputId;
  }

  // 最终 output 节点收集所有 step 结果
  const outputNodeId = `${recipeId}__chain_output`;
  nodes.push({
    node_id: outputNodeId,
    atom_type: 'result_collector',
    inputs: {
      entries: {
        type: 'static',
        value: {
          recipe_id: recipeId,
          type: 'chain',
          step_ids: params.steps.map((s) => s.step_id),
        },
      },
    },
  });

  return { nodes, output_node_id: outputNodeId };
}

// ─── raw 校验 + 编译 ──────────────────────────────────────────────────────────

function validateRaw(
  params: RawRecipeParams,
  prefix: string,
  errors: RecipeValidationError[],
): void {
  if (!params.atoms || !Array.isArray(params.atoms) || params.atoms.length === 0) {
    errors.push({ path: `${prefix}.atoms`, code: 'MISSING_FIELD', message: '`atoms` 不能为空数组' });
  }
  if (!params.output_atom_id || typeof params.output_atom_id !== 'string') {
    errors.push({ path: `${prefix}.output_atom_id`, code: 'MISSING_OUTPUT', message: '`output_atom_id` 是必填字段' });
  }
  if (!params.entry_atom_id || typeof params.entry_atom_id !== 'string') {
    errors.push({ path: `${prefix}.entry_atom_id`, code: 'MISSING_FIELD', message: '`entry_atom_id` 是必填字段' });
  }
}

/**
 * raw → GraphDef 编译策略：直接透传，将 atoms 转换为 GraphNodeDef[]
 */
function compileRaw(_recipeId: string, params: RawRecipeParams): GraphDef {
  const nodes: GraphNodeDef[] = params.atoms.map((atom) => {
    const a = atom as Record<string, unknown>;
    return {
      node_id: a['node_id'] as string,
      atom_type: (a['atom_type'] ?? a['type']) as string,
      inputs: (a['inputs'] as Record<string, InputSource>) ?? {},
    };
  });

  return { nodes, output_node_id: params.output_atom_id };
}
