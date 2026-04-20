/**
 * derived-calc.ts — 派生值计算工具（前后端共用）
 *
 * 支持简单算术表达式 + 属性名替换 + floor/ceil/round 函数。
 * 示例公式：
 *   "(CON + SIZ) / 10"  → HP
 *   "POW / 5"           → MP
 *   "POW"               → SAN
 *   "floor((STR + CON) / 10)"
 */

/**
 * derivedFormulaSchema 的一条定义
 */
export interface DerivedFormulaDef {
  formula: string;
  label?: string;
  min?: number;
  max?: number;
}

/**
 * 将公式中的属性名替换为实际数值，然后求值。
 * 安全限制：仅允许 数字、运算符、括号、空格和内置函数名。
 */
function evalFormula(formula: string, attrs: Record<string, number>): number {
  // 按属性名长度降序替换，防止短名前缀误替（如 STR 先于 ST）
  const sortedKeys = Object.keys(attrs).sort((a, b) => b.length - a.length);
  let expr = formula;
  for (const key of sortedKeys) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, 'g'), String(attrs[key] ?? 0));
  }
  // 替换内置数学函数别名
  expr = expr
    .replace(/\bfloor\b/gi, 'Math.floor')
    .replace(/\bceil\b/gi, 'Math.ceil')
    .replace(/\bround\b/gi, 'Math.round')
    .replace(/\bmin\b/gi, 'Math.min')
    .replace(/\bmax\b/gi, 'Math.max')
    .replace(/\babs\b/gi, 'Math.abs');

  // 安全性：只允许数字、运算符、括号、点、空格和 Math.*
  if (!/^[\d\s+\-*/().Math,]+$/.test(expr)) {
    return 0;
  }
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')() as number;
    return isFinite(result) ? Math.floor(result) : 0;
  } catch {
    return 0;
  }
}

/**
 * 计算所有派生值
 * @param attributes  基础属性键值对，如 { STR: 55, CON: 60, ... }
 * @param formulas    公式定义，如 { hp: { formula: "(CON + SIZ) / 10" }, ... }
 * @returns           派生值键值对，如 { hp: 11, mp: 12, san: 60 }
 */
export function calcDerived(
  attributes: Record<string, number>,
  formulas: Record<string, DerivedFormulaDef | string>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, def] of Object.entries(formulas)) {
    const formula = typeof def === 'string' ? def : def.formula;
    let value = evalFormula(formula, attributes);
    if (typeof def !== 'string') {
      if (def.min !== undefined) value = Math.max(value, def.min);
      if (def.max !== undefined) value = Math.min(value, def.max);
    }
    result[key] = value;
  }
  return result;
}

/**
 * COC7 默认派生值公式（规则集未提供 derived_formulas 时的回退）
 */
export const COC7_DEFAULT_DERIVED: Record<string, DerivedFormulaDef> = {
  HP:  { formula: 'floor((CON + SIZ) / 10)', label: '生命值', min: 1 },
  MP:  { formula: 'floor(POW / 5)', label: '魔法值', min: 0 },
  SAN: { formula: 'POW', label: '理智值', min: 0, max: 99 },
  LK:  { formula: 'POW * 5', label: '幸运值', min: 1, max: 99 },
  MOV: { formula: '8', label: '移动速度' },
  DB:  { formula: '0', label: '伤害奖励' },     // 由表查找，简化为0
  Build: { formula: '0', label: '体格' },
};
