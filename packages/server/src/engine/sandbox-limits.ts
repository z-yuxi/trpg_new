/**
 * 骰子引擎沙箱安全上限常量
 *
 * 所有执行器中的防护边界必须引用此文件，禁止在代码中直接写数字字面量。
 * 修改任何限制只需改动此处，配合 PR review 记录决策理由。
 */

/** 单次投骰表达式中允许的最大骰子数（如 100d6 中的 100） */
export const DICE_MAX_COUNT = 100;

/** 骰子面数上限（如 d10000），超出则视为恶意输入 */
export const DICE_MAX_SIDES = 10000;

/** 爆炸骰附加投掷次数上限（防止无限爆炸循环） */
export const DICE_MAX_EXPLOSION_EXTRA = 100;

/** AST 递归计算最大深度（防止深度嵌套表达式栈溢出） */
export const DICE_MAX_EVAL_DEPTH = 50;
// ─── GraphExecutor 层安全上限 ──────────────────────────────────────────────

/**
 * 单张图允许的最大节点数。
 * 超出则返回失败，防止恶意用户构造超大图进行 DoS。
 */
export const GRAPH_MAX_NODES = 200;