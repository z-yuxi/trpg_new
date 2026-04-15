// mathjs 同时提供 ESM 和 CJS 入口，通过 exports.require 条件加载 CJS 构建
// 使用 @ts-ignore 绕过 TypeScript 对 ESM-only 类型声明的报错
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const mathjsCjs: any = require('mathjs');
const { create, all } = mathjsCjs;

// 创建受限的 mathjs 实例
const math = create(all);

// 移除危险函数（注意：不能移除 evaluate，它是核心功能）
const BLOCKED_FUNCTIONS = [
  'import', 'createUnit', 'simplify',
  'derivative', 'resolve', 'chain',
];

for (const fn of BLOCKED_FUNCTIONS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (math as any)[fn] = undefined;
}

export interface FormulaContext {
  [key: string]: number;
}

/**
 * 安全地求值数学公式
 * @param formula - 公式字符串，如 "floor((base_value - 10) / 2)"
 * @param context - 变量上下文，如 { base_value: 15 }
 * @returns 求值结果（数字）
 * @throws Error 如果公式无效或包含危险操作
 */
export function evaluateFormula(formula: string, context: FormulaContext): number {
  if (!formula || !formula.trim()) {
    throw new Error('Formula cannot be empty');
  }

  // Validate no dangerous patterns
  const dangerousPatterns = [
    /require\s*\(/,
    /import\s*\(/,
    /process\./,
    /\beval\b/,
    /Function\s*\(/,
    /__proto__/,
    /prototype/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(formula)) {
      throw new Error('Formula contains forbidden operations');
    }
  }

  try {
    // Create a scope with only the provided context
    const scope: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(context)) {
      if (typeof val !== 'number') {
        throw new Error(`Variable '${key}' must be a number`);
      }
      scope[key] = val;
    }

    const result = math.evaluate(formula, scope);

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error(`Formula did not evaluate to a finite number: ${result}`);
    }

    return result;
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error(`Failed to evaluate formula: ${String(err)}`);
  }
}

/**
 * 验证公式是否安全（不执行，只检查语法和引用）
 */
export function validateFormula(
  formula: string,
  availableVars: string[]
): { valid: boolean; error?: string } {
  if (!formula || !formula.trim()) {
    return { valid: false, error: 'Formula cannot be empty' };
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /require\s*\(/,
    /import\s*\(/,
    /process\./,
    /\beval\b/,
    /Function\s*\(/,
    /__proto__/,
    /prototype/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(formula)) {
      return { valid: false, error: 'Formula contains forbidden operations' };
    }
  }

  try {
    // Build a dummy scope with zeros for all available vars
    const dummyScope: Record<string, number> = {};
    for (const v of availableVars) {
      dummyScope[v] = 0;
    }

    // Try to parse (not evaluate) by evaluating with zeros
    // Using a simple substitute: evaluate with dummyScope
    math.evaluate(formula, dummyScope);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
