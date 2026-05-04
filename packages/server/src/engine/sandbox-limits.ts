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

// ─── 执行时间与资源上限（附录 D01 §2）─────────────────────────────────────────

/** 单次 Recipe/Graph 执行的最大允许时间（毫秒），超出则强制中止 */
export const EXEC_TIMEOUT_MS = 500;

/** 沙箱允许的最大内存用量（MB），超出则视为资源滥用 */
export const MEMORY_LIMIT_MB = 64;

/** 递归调用最大深度，防止无限递归导致调用栈溢出 */
export const MAX_RECURSION_DEPTH = 16;

/** 循环指令最大迭代次数，防止死循环占用执行线程 */
export const MAX_LOOP_ITERATIONS = 1000;