import { describe, it, expect } from 'vitest';
import { evaluateFormula, validateFormula } from '../formula-evaluator';

describe('Formula Evaluator', () => {
  it('应能计算简单算术', () => {
    expect(evaluateFormula('2 + 3', {})).toBe(5);
    expect(evaluateFormula('10 - 4', {})).toBe(6);
    expect(evaluateFormula('3 * 4', {})).toBe(12);
    expect(evaluateFormula('10 / 2', {})).toBe(5);
  });

  it('应能使用上下文变量', () => {
    expect(evaluateFormula('base_value + bonus', { base_value: 10, bonus: 5 })).toBe(15);
    expect(evaluateFormula('score * 2', { score: 7 })).toBe(14);
  });

  it('应能调用数学函数', () => {
    expect(evaluateFormula('floor(7.8)', {})).toBe(7);
    expect(evaluateFormula('ceil(7.2)', {})).toBe(8);
    expect(evaluateFormula('max(3, 5, 1)', {})).toBe(5);
    expect(evaluateFormula('min(3, 5, 1)', {})).toBe(1);
    expect(evaluateFormula('abs(-5)', {})).toBe(5);
    expect(evaluateFormula('round(3.6)', {})).toBe(4);
  });

  it('应能处理复杂公式', () => {
    // D&D-style modifier: floor((stat - 10) / 2)
    const result = evaluateFormula('floor((stat - 10) / 2)', { stat: 15 });
    expect(result).toBe(2); // floor((15-10)/2) = floor(2.5) = 2
  });

  it('应对空公式抛出错误', () => {
    expect(() => evaluateFormula('', {})).toThrow();
  });

  it('应对未定义变量抛出错误', () => {
    expect(() => evaluateFormula('undefined_var + 1', {})).toThrow();
  });
});

describe('Formula Validator', () => {
  it('应验证合法公式', () => {
    const result = validateFormula('x + y * 2', ['x', 'y']);
    expect(result.valid).toBe(true);
  });

  it('应拒绝包含危险操作的公式', () => {
    const result1 = validateFormula('eval("bad")', []);
    expect(result1.valid).toBe(false);

    const result2 = validateFormula('require("fs")', []);
    expect(result2.valid).toBe(false);
  });

  it('应拒绝空公式', () => {
    const result = validateFormula('', []);
    expect(result.valid).toBe(false);
  });

  it('应拒绝引用不在白名单中的变量', () => {
    // When available_vars doesn't include the referenced var, evaluation fails
    const result = validateFormula('y + 1', ['x']); // y not in availableVars
    expect(result.valid).toBe(false);
  });
});
