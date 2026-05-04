import { describe, it, expect } from 'vitest';
import { exportCSON, importCSON, validateCSON } from '../cson';

/** exportCSON 所需的输入数据 */
const mockSheet = {
  name: '李明',
  ruleset_id: 'coc-7',
  occupation_id: 'journalist',
  attributes: { STR: 60, DEX: 55, INT: 70, POW: 65, CON: 50, APP: 45, EDU: 75, SIZ: 55 },
  skills: { '聆听': 40, '侦查': 50, '图书馆': 65 },
  derived_max: {
    HP: { current: 10, max: 10 },
    MP: { current: 13, max: 13 },
    SAN: { current: 65, max: 99 },
  },
  equipment: ['手电筒', '左轮手枪'],
  background: '热血记者，志向远大',
  character_code: 'CHR-001',
};

const EXPORTER = '测试用户';

describe('CSON - exportCSON', () => {
  it('应将角色表转换为有效 JSON 字符串', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    expect(result).toBeTypeOf('string');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('schema_version 应为 1.0', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(result);
    expect(doc.schema_version).toBe('1.0');
  });

  it('character.ruleset_ref 应匹配', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(result);
    expect(doc.character.ruleset_ref).toBe('coc-7');
  });

  it('属性应完整保留', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(result);
    expect(doc.character.attributes.STR).toBe(60);
    expect(doc.character.attributes.INT).toBe(70);
  });

  it('技能应完整保留', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(result);
    expect(doc.character.skills['聆听']).toBe(40);
    expect(doc.character.skills['侦查']).toBe(50);
  });

  it('资源 HP 应包含 current/max', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(result);
    expect(doc.character.resources.HP.current).toBe(10);
    expect(doc.character.resources.HP.max).toBe(10);
  });

  it('装备列表应保留', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(result);
    expect(doc.character.equipment).toContain('手电筒');
  });

  it('meta.exported_by 应为传入的导出者', () => {
    const result = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(result);
    expect(doc.meta.exported_by).toBe(EXPORTER);
  });
});

describe('CSON - importCSON', () => {
  it('应解析有效 CSON JSON', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const parsed = importCSON(cson);
    expect(parsed.ruleset_id).toBe('coc-7');
    expect(parsed.name).toBe('李明');
  });

  it('属性应正确映射', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const parsed = importCSON(cson);
    expect(parsed.attributes['STR']).toBe(60);
    expect(parsed.attributes['INT']).toBe(70);
  });

  it('技能应正确映射', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const parsed = importCSON(cson);
    expect(parsed.skills['聆听']).toBe(40);
  });

  it('derived_max（资源）应正确映射', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const parsed = importCSON(cson);
    expect(parsed.derived_max['HP'].current).toBe(10);
    expect(parsed.derived_max['SAN'].max).toBe(99);
  });

  it('装备列表应正确映射', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const parsed = importCSON(cson);
    expect(parsed.equipment).toContain('手电筒');
    expect(parsed.equipment).toContain('左轮手枪');
  });

  it('往返转换后数据应一致', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const parsed = importCSON(cson);
    const cson2 = exportCSON({ ...parsed, derived_max: parsed.derived_max }, EXPORTER);
    const parsed2 = importCSON(cson2);
    expect(parsed2.attributes).toEqual(parsed.attributes);
    expect(parsed2.skills).toEqual(parsed.skills);
    expect(parsed2.derived_max).toEqual(parsed.derived_max);
  });

  it('无效 JSON 应抛出错误', () => {
    expect(() => importCSON('not-json')).toThrow();
  });

  it('无效 CSON 结构应抛出错误', () => {
    expect(() => importCSON('{}')).toThrow();
  });
});

describe('CSON - validateCSON', () => {
  it('有效 CSON 应通过验证', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const result = validateCSON(cson);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('缺少 ruleset_ref 字段应报错', () => {
    const doc = JSON.parse(exportCSON(mockSheet, EXPORTER));
    delete doc.character.ruleset_ref;
    const result = validateCSON(JSON.stringify(doc));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('schema_version 不为 1.0 应报错', () => {
    const doc = JSON.parse(exportCSON(mockSheet, EXPORTER));
    doc.schema_version = '2.0';
    const result = validateCSON(JSON.stringify(doc));
    expect(result.valid).toBe(false);
  });

  it('空字符串应报错', () => {
    const result = validateCSON('');
    expect(result.valid).toBe(false);
  });

  it('非 JSON 字符串应报错', () => {
    const result = validateCSON('plain text');
    expect(result.valid).toBe(false);
  });

  it('equipment 不为数组应报错', () => {
    const doc = JSON.parse(exportCSON(mockSheet, EXPORTER));
    doc.character.equipment = 'not an array';
    const result = validateCSON(JSON.stringify(doc));
    expect(result.valid).toBe(false);
  });

  // ========== K.10/K.11 规范合规性测试 ==========
  /**
   * K.10: 角色卡开放交换格式规范（CSON）
   * K.11: 版本兼容性与向后兼容
   * 以下测试显式验证 CSON 实现对规范的遵守
   */
  it('[K.10/K.11 规范] exportCSON 必须导出 schema_version=1.0', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(cson);
    expect(doc.schema_version).toBe('1.0');
  });

  it('[K.10 规范] 所有必需字段应存在：meta, character, character.name, character.ruleset_ref, character.attributes, character.skills, character.equipment', () => {
    const cson = exportCSON(mockSheet, EXPORTER);
    const doc = JSON.parse(cson);
    expect(doc.meta).toBeDefined();
    expect(doc.character).toBeDefined();
    expect(doc.character.name).toBeDefined();
    expect(doc.character.ruleset_ref).toBeDefined();
    expect(doc.character.attributes).toBeDefined();
    expect(doc.character.skills).toBeDefined();
    expect(doc.character.equipment).toBeDefined();
  });

  it('[K.11 规范] validateCSON 应拒绝 schema_version!=1.0 的文档', () => {
    const doc = JSON.parse(exportCSON(mockSheet, EXPORTER));
    doc.schema_version = '2.0';
    const result = validateCSON(JSON.stringify(doc));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('schema_version must be "1.0"');
  });

  it('[K.10/K.11 规范] Round-trip 一致性测试：导出→导入→导出应产生等价结构', () => {
    const cson1 = exportCSON(mockSheet, EXPORTER);
    const parsed = importCSON(cson1);
    const cson2 = exportCSON({ ...parsed, derived_max: parsed.derived_max }, EXPORTER);
    const doc1 = JSON.parse(cson1).character;
    const doc2 = JSON.parse(cson2).character;
    // 检查核心字段一致性
    expect(doc2.name).toBe(doc1.name);
    expect(doc2.ruleset_ref).toBe(doc1.ruleset_ref);
    expect(doc2.attributes).toEqual(doc1.attributes);
    expect(doc2.skills).toEqual(doc1.skills);
    expect(doc2.equipment).toEqual(doc1.equipment);
  });
});
