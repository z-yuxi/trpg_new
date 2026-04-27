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
  'parse', 'compile', 'help', 'typed', 'config',
  'rationalize',
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
    // 使用 math.parse 做 AST 静态分析，不执行公式，避免副作用
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = (math as any).parse(formula);
    // 遍历 AST，检查是否引用了被屏蔽函数或不允许的全局对象
    const availableSet = new Set(availableVars);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.traverse((n: any) => {
      if (n.type === 'SymbolNode' || n.type === 'FunctionNode') {
        const name: string = n.name ?? n.fn?.name ?? '';
        if (BLOCKED_FUNCTIONS.includes(name)) {
          throw new Error(`Blocked function referenced: ${name}`);
        }
        // 不允许引用 availableVars 之外的全局对象（SymbolNode 且不是已知变量/函数）
        if (n.type === 'SymbolNode' && name && !availableSet.has(name)) {
          // 允许 mathjs 内置常数和函数名（非大写开头的全局变量视为潜在危险，但此处宽松处理）
          // 仅拒绝明显的全局对象访问
          if (['process', 'global', 'window', 'require', 'eval', 'Function'].includes(name)) {
            throw new Error(`Forbidden symbol referenced: ${name}`);
          }
        }
      }
    });
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
