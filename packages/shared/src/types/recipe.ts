/**
 * Recipe 配方系统类型定义（规则编辑器编辑真源）
 *
 * 架构原则：
 *   - Recipe 是"编辑真源"（source of truth），用户直接编辑
 *   - atoms + connections 是"编译产物"（compiled_graph），由 compile() 自动生成
 *   - 执行器零感知 recipe，只消费 atoms + connections
 *
 * 参见：docs/规则配方系统技术方案.md
 */

// ===== 配方类型枚举 =====

export type RecipeType =
  | 'threshold_check'
  | 'opposed_check'
  | 'resource_modify'
  | 'random_table'
  | 'initiative'
  | 'growth_check'
  | 'accumulation'
  | 'chain'
  | 'raw';

// ===== 难度系统 =====

export interface RecipeDifficulty {
  mode: 'divisor' | 'none';
  /** divisor 模式的除数列表，如 [1, 2, 5] = 常规/困难/极难 */
  divisors?: number[];
  /** 默认难度索引，默认 0；越界时自动夹紧到有效范围末端 */
  default_level?: number;
}

// ===== 目标值修正来源 =====

export interface ModifierSource {
  source: 'attribute_mod' | 'proficiency' | 'fixed' | 'formula';
  ref?: string;
  value?: number;
  formula?: string;
}

// ===== 成功等级（tier）=====

export interface SuccessTier {
  /** 程序标识，如 "critical" | "extreme" | "hard" | "regular" | "fail" | "fumble" */
  name: string;
  /** 显示名称，如 "大成功" */
  label: string;
  /** 判定表达式，如 "roll == 1"、"roll <= target / 5" */
  condition: string;
  /** 是否算作成功 */
  is_success: boolean;
}

// ===== 4.2 阈值检定（threshold_check）=====

export interface ThresholdCheckParams {
  dice_expression: string;
  target_source: 'skill' | 'attribute' | 'fixed' | 'formula';
  target_ref?: string;
  target_fixed?: number;
  target_formula?: string;
  success_direction: 'lte' | 'gte';
  modifier_sources?: ModifierSource[];
  difficulty?: RecipeDifficulty;
  advantage_system?: {
    enabled: boolean;
    extra_dice: number;
    keep: 'highest' | 'lowest';
  };
  /** 从上到下匹配，首个命中即最终结果；全部未命中兜底返回 fail + NO_TIER_MATCHED */
  tiers: SuccessTier[];
}

// ===== 4.3 对抗检定（opposed_check）=====

export interface OpposedCheckParams {
  attacker: {
    dice_expression: string;
    target_source: 'skill' | 'attribute';
    target_ref: string;
  };
  defender: {
    dice_expression: string;
    target_source: 'skill' | 'attribute';
    target_ref: string;
  };
  resolution: 'tier_compare' | 'value_compare';
  /** reroll 最多 3 轮，仍平局按 defender_wins 收敛 */
  tie_rule: 'attacker_wins' | 'defender_wins' | 'reroll';
}

// ===== 4.4 资源修改（resource_modify）=====

export interface ResourceModifyParams {
  resource_ref: string;
  delta: {
    mode: 'fixed' | 'dice' | 'formula';
    value?: number;
    expression?: string;
  };
  direction: 'decrease' | 'increase';
  /** 'zero' 入库时规范化为 0 */
  clamp_min?: number | 'zero';
  clamp_max?: 'resource_max' | number;
  /** 先计算并 clamp，再按最终值触发 */
  on_zero?: string;
  on_overflow?: string;
}

// ===== 4.5 随机表（random_table）=====

export interface RandomTableEntry {
  /** 区间 [min, max]，单值写 [x, x] */
  range: [number, number];
  result: string;
  effect_recipe_id?: string;
}

export interface RandomTableParams {
  dice_expression: string;
  entries: RandomTableEntry[];
}

// ===== 4.6 先攻排序（initiative）=====

export interface InitiativeParams {
  formula: string;
  sort_order: 'desc' | 'asc';
  /** 未填写时按雪花 ID / 行动提交顺序稳定排序 */
  tiebreaker?: string;
}

// ===== 4.7 成长检定（growth_check）=====

export interface GrowthCheckParams {
  check_dice: string;
  check_condition: string;
  growth_dice: string;
  growth_target: 'skill' | 'attribute';
  max_value: number;
}

// ===== 4.8 累积判定（accumulation）=====

export interface AccumulationParams {
  dice_expression: string;
  success_condition: string;
  success_target: number;
  failure_target: number;
  /** natural_roll == 20 时触发 */
  critical_success_effect?: string;
  /** natural_roll == 1 时算 2 次失败（不再叠加常规失败 +1） */
  critical_failure_effect?: string;
  on_success_reached: string;
  on_failure_reached: string;
}

// ===== 4.9 连锁配方（chain）=====

export interface ChainStep {
  step_id: string;
  /** 引用另一个 recipe 的 id，不允许引用 chain 类型（最大嵌套深度 1） */
  recipe_ref: string;
  input_mapping?: Record<string, string>;
  condition?: {
    depends_on: string;
    when: 'success' | 'failure' | 'always' | 'expression';
    /** when='expression' 时；可访问 steps.<step_id>.result.* + input.* */
    expression?: string;
  };
}

export interface ChainParams {
  steps: ChainStep[];
}

// ===== 4.10 原始原子图（raw）=====
// P1 仅用于导入兼容迁移封装；P2 开放运行时执行与编辑器入口

export interface RawRecipeParams {
  atoms: object[];
  connections: object[];
  entry_atom_id: string;
  output_atom_id: string;
}

// ===== 参数联合类型 =====

export type RecipeParams =
  | ThresholdCheckParams
  | OpposedCheckParams
  | ResourceModifyParams
  | RandomTableParams
  | InitiativeParams
  | GrowthCheckParams
  | AccumulationParams
  | ChainParams
  | RawRecipeParams;

// ===== 编译产物 =====

export interface RecipeCompiledGraph {
  atoms: object[];
  connections: object[];
  entry_atom_id: string;
  output_atom_id: string;
}

// ===== 配方顶层结构 =====

export interface Recipe {
  /** 配方唯一标识，如 "coc7_skill_check" */
  id: string;
  type: RecipeType;
  name: string;
  description?: string;
  tags?: string[];
  params: RecipeParams;
}

// ===== 规则包编辑主模型（recipe_source）=====

/**
 * 规则包的完整编辑模型（"编辑真源"）。
 * 保存时服务端自动 validate + compile，结果缓存在 compiled_graph。
 */
export interface RulesetRecipeSource {
  /** 规则包内所有配方列表 */
  recipes: Recipe[];
  /**
   * 指令到配方的映射（触发词 → recipe_id）
   * key = 指令触发词，如 "ra"、"rc"
   */
  command_recipe_map?: Record<string, string>;
}

// ===== Legacy 标记与兼容结构 =====

/**
 * Legacy 数据来源标记。
 * 当规则包数据来自旧 atoms/connections 格式，
 * 且尚未完成 Recipe 迁移时，打上此标记。
 */
export type LegacyDataOrigin =
  | 'atoms_connections'    // 直接来自旧 atoms + connections 字段
  | 'raw_recipe_wrapped';  // 已包装为 raw recipe，但编辑器尚未迁移

/**
 * 规则包编译产物缓存。
 * 保存时自动写入，执行器直接读取，不重复编译。
 */
export interface RulesetCompiledGraph {
  atoms: object;
  connections: object;
  /** 编译时间戳，用于缓存失效判断 */
  compiled_at: string;
  /** 编译器版本，版本变更时缓存自动失效 */
  compiler_version: string;
}

/**
 * 规则包 Legacy 元数据。
 * 当 legacy=true 时附加此结构，描述旧数据来源和迁移状态。
 */
export interface LegacyMeta {
  origin: LegacyDataOrigin;
  /** 迁移状态：pending=待迁移，partial=部分迁移，done=已完成 */
  migration_status: 'pending' | 'partial' | 'done';
  /** 不可无损迁移的原因描述（可选） */
  migration_note?: string;
}
