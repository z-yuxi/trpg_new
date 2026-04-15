import { describe, it, expect } from 'vitest';
import { CharacterSkillReaderAtom } from '../atoms/character-skill-reader';
import { ResourceModifyAtom } from '../atoms/resource-modify';
import { FormulaEvalAtom } from '../atoms/formula-eval';

const sampleCharacter = {
  attributes: { strength: 15, intelligence: 12 },
  skills: { perception: 60, stealth: 40 },
  resources: { hp: { current: 8, max: 10 }, mp: { current: 5, max: 20 } },
};

describe('CharacterSkillReaderAtom', () => {
  it('应正确读取 attribute', () => {
    const atom = new CharacterSkillReaderAtom();
    const output = atom.execute({
      character_data: sampleCharacter,
      field_type: 'attribute',
      field_name: 'strength',
    });
    const result = output.result as { value: number };
    expect(result.value).toBe(15);
  });

  it('应正确读取 skill', () => {
    const atom = new CharacterSkillReaderAtom();
    const output = atom.execute({
      character_data: sampleCharacter,
      field_type: 'skill',
      field_name: 'perception',
    });
    const result = output.result as { value: number };
    expect(result.value).toBe(60);
  });

  it('应正确读取 resource_current', () => {
    const atom = new CharacterSkillReaderAtom();
    const output = atom.execute({
      character_data: sampleCharacter,
      field_type: 'resource_current',
      field_name: 'hp',
    });
    const result = output.result as { value: number };
    expect(result.value).toBe(8);
  });

  it('应对不存在的字段抛出包含字段名的错误', () => {
    const atom = new CharacterSkillReaderAtom();
    expect(() => atom.execute({
      character_data: sampleCharacter,
      field_type: 'attribute',
      field_name: 'nonexistent_field',
    })).toThrow(/nonexistent_field/);
  });
});

describe('ResourceModifyAtom', () => {
  it('应正常增加资源值', () => {
    const atom = new ResourceModifyAtom();
    const output = atom.execute({ current_value: 5, max_value: 10, delta: 3 });
    const result = output.result as { old_value: number; new_value: number; clamped: boolean };
    expect(result.old_value).toBe(5);
    expect(result.new_value).toBe(8);
    expect(result.clamped).toBe(false);
  });

  it('应在超过 max_value 时 clamp', () => {
    const atom = new ResourceModifyAtom();
    const output = atom.execute({ current_value: 8, max_value: 10, delta: 5 });
    const result = output.result as { new_value: number; clamped: boolean };
    expect(result.new_value).toBe(10);
    expect(result.clamped).toBe(true);
  });

  it('应在低于 min_value (0) 时 clamp', () => {
    const atom = new ResourceModifyAtom();
    const output = atom.execute({ current_value: 3, max_value: 10, delta: -10 });
    const result = output.result as { new_value: number; clamped: boolean };
    expect(result.new_value).toBe(0);
    expect(result.clamped).toBe(true);
  });

  it('应支持自定义 min_value', () => {
    const atom = new ResourceModifyAtom();
    const output = atom.execute({ current_value: 3, max_value: 10, delta: -5, min_value: -10 });
    const result = output.result as { new_value: number };
    expect(result.new_value).toBe(-2);
  });
});

describe('FormulaEvalAtom', () => {
  it('应正确求值公式', () => {
    const atom = new FormulaEvalAtom();
    const output = atom.execute({
      formula: 'base + bonus * 2',
      variables: { base: 10, bonus: 5 },
    });
    const result = output.result as { value: number };
    expect(result.value).toBe(20);
  });

  it('应对无效公式抛出错误', () => {
    const atom = new FormulaEvalAtom();
    expect(() => atom.execute({
      formula: 'undefined_var + 1',
      variables: {},
    })).toThrow();
  });

  it('应对空 formula 抛出错误', () => {
    const atom = new FormulaEvalAtom();
    expect(() => atom.execute({
      formula: '',
      variables: {},
    })).toThrow();
  });
});
