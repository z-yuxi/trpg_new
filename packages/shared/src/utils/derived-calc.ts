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

// ── 纯算术 AST 解析器（替代 eval/Function）────────────────────────────────

type _ArithToken =
  | { t: 'num'; v: number }
  | { t: 'op';  v: '+' | '-' | '*' | '/' }
  | { t: 'lp' }
  | { t: 'rp' }
  | { t: 'comma' }
  | { t: 'func'; v: string };

const _MATH_FUNCS = new Set(['floor', 'ceil', 'round', 'min', 'max', 'abs']);

function _tokenizeArith(expr: string): _ArithToken[] {
  const tokens: _ArithToken[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let s = '';
      while (i < expr.length && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
        s += expr[i++];
      }
      tokens.push({ t: 'num', v: parseFloat(s) });
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ t: 'op', v: ch as '+' | '-' | '*' | '/' }); i++; continue;
    }
    if (ch === '(') { tokens.push({ t: 'lp' }); i++; continue; }
    if (ch === ')') { tokens.push({ t: 'rp' }); i++; continue; }
    if (ch === ',') { tokens.push({ t: 'comma' }); i++; continue; }
    if (/[a-zA-Z_]/.test(ch)) {
      let s = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { s += expr[i++]; }
      // 支持 Math.floor / Math.ceil 等带前缀写法
      if (s === 'Math' && i < expr.length && expr[i] === '.') {
        i++; // 消耗 '.'
        let method = '';
        while (i < expr.length && /[a-zA-Z]/.test(expr[i])) { method += expr[i++]; }
        s = method;
      }
      if (!_MATH_FUNCS.has(s)) {
        throw new Error(`Unknown identifier in formula: ${s}`);
      }
      tokens.push({ t: 'func', v: s });
      continue;
    }
    throw new Error(`Unexpected character in formula: ${ch}`);
  }
  return tokens;
}

type _Pos = { i: number };

function _parseArithExpr(toks: _ArithToken[], p: _Pos): number {
  let v = _parseArithTerm(toks, p);
  while (p.i < toks.length && toks[p.i].t === 'op') {
    const op = (toks[p.i] as { t: 'op'; v: string }).v;
    if (op !== '+' && op !== '-') break;
    p.i++;
    const r = _parseArithTerm(toks, p);
    v = op === '+' ? v + r : v - r;
  }
  return v;
}

function _parseArithTerm(toks: _ArithToken[], p: _Pos): number {
  let v = _parseArithUnary(toks, p);
  while (p.i < toks.length && toks[p.i].t === 'op') {
    const op = (toks[p.i] as { t: 'op'; v: string }).v;
    if (op !== '*' && op !== '/') break;
    p.i++;
    const r = _parseArithUnary(toks, p);
    if (op === '/') {
      if (r === 0) throw new Error('Division by zero');
      v = v / r;
    } else {
      v = v * r;
    }
  }
  return v;
}

function _parseArithUnary(toks: _ArithToken[], p: _Pos): number {
  if (
    p.i < toks.length &&
    toks[p.i].t === 'op' &&
    (toks[p.i] as { t: 'op'; v: string }).v === '-'
  ) {
    p.i++;
    return -_parseArithPrimary(toks, p);
  }
  return _parseArithPrimary(toks, p);
}

function _parseArithPrimary(toks: _ArithToken[], p: _Pos): number {
  if (p.i >= toks.length) throw new Error('Unexpected end of expression');
  const tok = toks[p.i];

  if (tok.t === 'num') { p.i++; return tok.v; }

  if (tok.t === 'func') {
    p.i++;
    if (p.i >= toks.length || toks[p.i].t !== 'lp') {
      throw new Error(`Expected '(' after function '${tok.v}'`);
    }
    p.i++; // 消耗 '('
    const args: number[] = [_parseArithExpr(toks, p)];
    while (p.i < toks.length && toks[p.i].t === 'comma') {
      p.i++;
      args.push(_parseArithExpr(toks, p));
    }
    if (p.i >= toks.length || toks[p.i].t !== 'rp') {
      throw new Error(`Missing closing ')' for function '${tok.v}'`);
    }
    p.i++; // 消耗 ')'
    switch (tok.v) {
      case 'floor': return Math.floor(args[0]);
      case 'ceil':  return Math.ceil(args[0]);
      case 'round': return Math.round(args[0]);
      case 'min':   return Math.min(...args);
      case 'max':   return Math.max(...args);
      case 'abs':   return Math.abs(args[0]);
      default:      throw new Error(`Unknown function: ${tok.v}`);
    }
  }

  if (tok.t === 'lp') {
    p.i++;
    const v = _parseArithExpr(toks, p);
    if (p.i >= toks.length || toks[p.i].t !== 'rp') {
      throw new Error("Missing closing ')'");
    }
    p.i++;
    return v;
  }

  throw new Error(`Unexpected token: ${JSON.stringify(tok)}`);
}

/**
 * 将公式中的属性名替换为实际数值，然后用纯 AST 解析器求值。
 * 不使用 eval/Function，完全基于递归下降解析。
 */
function evalFormula(formula: string, attrs: Record<string, number>): number {
  // 按属性名长度降序替换，防止短名前缀误替（如 STR 先于 ST）
  const sortedKeys = Object.keys(attrs).sort((a, b) => b.length - a.length);
  let expr = formula;
  for (const key of sortedKeys) {
    // 转义正则元字符，防止属性名本身含特殊字符
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expr = expr.replace(new RegExp(`\\b${escapedKey}\\b`, 'g'), String(attrs[key] ?? 0));
  }
  try {
    const toks = _tokenizeArith(expr);
    const p = { i: 0 };
    const result = _parseArithExpr(toks, p);
    if (p.i !== toks.length) throw new Error('Unexpected content after expression');
    return isFinite(result) ? result : 0;
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
