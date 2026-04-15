import { describe, it, expect } from 'vitest';
import { tokenize } from '../dice-lexer';
import { parse } from '../dice-parser';
import { evaluateDice, evaluateDiceWithRng } from '../dice-evaluator';

describe('Dice Lexer', () => {
  it('应能解析基础骰子表达式 "3d6"', () => {
    const tokens = tokenize('3d6');
    expect(tokens.map(t => t.type)).toEqual(['NUMBER', 'D', 'NUMBER', 'EOF']);
    expect(tokens[0].value).toBe('3');
    expect(tokens[2].value).toBe('6');
  });

  it('应能解析带修饰的表达式 "4d6kh3"', () => {
    const tokens = tokenize('4d6kh3');
    expect(tokens.map(t => t.type)).toEqual(['NUMBER', 'D', 'NUMBER', 'KH', 'NUMBER', 'EOF']);
  });

  it('应能解析复合表达式 "2d6+1d4+5"', () => {
    const tokens = tokenize('2d6+1d4+5');
    expect(tokens.map(t => t.type)).toEqual([
      'NUMBER', 'D', 'NUMBER', 'PLUS',
      'NUMBER', 'D', 'NUMBER', 'PLUS',
      'NUMBER', 'EOF'
    ]);
  });

  it('应能解析爆炸骰 "1d6!"', () => {
    const tokens = tokenize('1d6!');
    expect(tokens.map(t => t.type)).toContain('BANG');
  });

  it('应对未知字符抛出错误', () => {
    expect(() => tokenize('3d6@')).toThrow();
  });
});

describe('Dice Parser', () => {
  it('应生成正确的 AST for "3d6"', () => {
    const tokens = tokenize('3d6');
    const ast = parse(tokens);
    expect(ast.type).toBe('dice_roll');
    if (ast.type === 'dice_roll') {
      expect(ast.count).toBe(3);
      expect(ast.sides).toBe(6);
      expect(ast.modifiers).toHaveLength(0);
    }
  });

  it('应处理运算符优先级 "2d6+3*2"', () => {
    const tokens = tokenize('2d6+3*2');
    const ast = parse(tokens);
    // Should be: dice_roll + (3 * 2)
    expect(ast.type).toBe('binary_op');
    if (ast.type === 'binary_op') {
      expect(ast.op).toBe('+');
      expect(ast.right.type).toBe('binary_op');
    }
  });

  it('应解析 kh 修饰符 "4d6kh3"', () => {
    const tokens = tokenize('4d6kh3');
    const ast = parse(tokens);
    expect(ast.type).toBe('dice_roll');
    if (ast.type === 'dice_roll') {
      expect(ast.modifiers).toHaveLength(1);
      expect(ast.modifiers[0].type).toBe('keep_highest');
      expect(ast.modifiers[0].value).toBe(3);
    }
  });
});

describe('Dice Evaluator', () => {
  it('固定随机种子下 1d6 应返回可预期结果', () => {
    let i = 0;
    const values = [0.5]; // Math.floor(0.5 * 6) + 1 = 4
    const rng = () => values[i++] ?? 0.5;
    const result = evaluateDiceWithRng('1d6', rng);
    expect(result.total).toBe(4);
  });

  it('4d6kh3 应保留最高的3个骰子', () => {
    let i = 0;
    // Math.floor(rng * 6) + 1:
    // 0.0 → 1, 0.5 → 4, 0.9 → 6, 0.2 → 2 => keep highest 3: [4,6,2]=12
    const values = [0.0, 0.5, 0.9, 0.2];
    const rng = () => values[i++] ?? 0.5;
    const result = evaluateDiceWithRng('4d6kh3', rng);
    expect(result.total).toBe(12); // 4+6+2
  });

  it('应能正确计算 2d6+3', () => {
    let i = 0;
    const values = [0.5, 0.5]; // 4, 4
    const rng = () => values[i++] ?? 0.5;
    const result = evaluateDiceWithRng('2d6+3', rng);
    expect(result.total).toBe(11); // 4+4+3
  });

  it('应对空表达式抛出错误', () => {
    expect(() => evaluateDice('')).toThrow();
  });

  it('应对无效表达式抛出错误', () => {
    expect(() => evaluateDice('abc')).toThrow();
  });

  it('result 包含 details 字段', () => {
    const result = evaluateDice('1d6');
    expect(result.details).toBeTruthy();
    expect(typeof result.details).toBe('string');
  });

  it('应能处理括号 "(2d6+3)*2"', () => {
    let i = 0;
    const values = [0.5, 0.5]; // 4, 4 => (4+4+3)*2=22? wait: (2d6+3)*2 = (4+4+3)*2=22
    // actually 2d6 with rng 0.5 = [4,4], sum=8, +3=11, *2=22
    const rng = () => values[i++] ?? 0.5;
    const result = evaluateDiceWithRng('(2d6+3)*2', rng);
    expect(result.total).toBe(22);
  });
});
