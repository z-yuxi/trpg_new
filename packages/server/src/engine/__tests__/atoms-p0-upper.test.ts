import { describe, it, expect } from 'vitest';
import { DiceRollAtom } from '../atoms/dice-roll';
import { ThresholdCompareAtom } from '../atoms/threshold-compare';
import { MultiplyAtom } from '../atoms/multiply';
import { IfElseAtom } from '../atoms/if-else';
import { ResultCollectorAtom } from '../atoms/result-collector';

describe('DiceRollAtom', () => {
  it('应正确执行骰子表达式', () => {
    let i = 0;
    const rng = () => [0.5, 0.5][i++] ?? 0.5;
    const atom = new DiceRollAtom();
    const output = atom.execute({ expression: '2d6', rng });
    const result = output.result as { total: number; details: string };
    expect(result.total).toBe(8); // 4+4
    expect(typeof result.details).toBe('string');
  });

  it('应对缺少 expression 抛出错误', () => {
    const atom = new DiceRollAtom();
    expect(() => atom.execute({})).toThrow();
  });
});

describe('ThresholdCompareAtom', () => {
  it('应正确比较 value < threshold', () => {
    const atom = new ThresholdCompareAtom();
    const output = atom.execute({ value: 3, threshold: 5, operator: '<' });
    const result = output.result as { passed: boolean };
    expect(result.passed).toBe(true);
  });

  it('应正确比较失败的情况', () => {
    const atom = new ThresholdCompareAtom();
    const output = atom.execute({ value: 10, threshold: 5, operator: '<' });
    const result = output.result as { passed: boolean };
    expect(result.passed).toBe(false);
  });

  it('应支持 == 操作符', () => {
    const atom = new ThresholdCompareAtom();
    const output = atom.execute({ value: 5, threshold: 5, operator: '==' });
    const result = output.result as { passed: boolean };
    expect(result.passed).toBe(true);
  });

  it('应对无效操作符抛出错误', () => {
    const atom = new ThresholdCompareAtom();
    expect(() => atom.execute({ value: 1, threshold: 2, operator: '???' })).toThrow();
  });
});

describe('MultiplyAtom', () => {
  it('应正确相乘两个数', () => {
    const atom = new MultiplyAtom();
    const output = atom.execute({ a: 3, b: 4 });
    const result = output.result as { value: number };
    expect(result.value).toBe(12);
  });

  it('应处理负数', () => {
    const atom = new MultiplyAtom();
    const output = atom.execute({ a: -2, b: 5 });
    const result = output.result as { value: number };
    expect(result.value).toBe(-10);
  });

  it('应对非数字输入抛出错误', () => {
    const atom = new MultiplyAtom();
    expect(() => atom.execute({ a: 'abc', b: 2 })).toThrow();
  });
});

describe('IfElseAtom', () => {
  it('条件为 true 时返回 then_value', () => {
    const atom = new IfElseAtom();
    const output = atom.execute({ condition: true, then_value: 'yes', else_value: 'no' });
    const result = output.result as { value: unknown; branch: string };
    expect(result.value).toBe('yes');
    expect(result.branch).toBe('then');
  });

  it('条件为 false 时返回 else_value', () => {
    const atom = new IfElseAtom();
    const output = atom.execute({ condition: false, then_value: 42, else_value: 0 });
    const result = output.result as { value: unknown; branch: string };
    expect(result.value).toBe(0);
    expect(result.branch).toBe('else');
  });

  it('应对非布尔 condition 抛出错误', () => {
    const atom = new IfElseAtom();
    expect(() => atom.execute({ condition: 1, then_value: 'a', else_value: 'b' })).toThrow();
  });
});

describe('ResultCollectorAtom', () => {
  it('应收集所有 entries 并返回', () => {
    const atom = new ResultCollectorAtom();
    const output = atom.execute({ entries: { hp: 10, mp: 20, alive: true } });
    const result = output.result as Record<string, unknown>;
    expect(result['hp']).toBe(10);
    expect(result['mp']).toBe(20);
    expect(result['alive']).toBe(true);
  });

  it('应对非对象 entries 抛出错误', () => {
    const atom = new ResultCollectorAtom();
    expect(() => atom.execute({ entries: 'invalid' })).toThrow();
  });
});
