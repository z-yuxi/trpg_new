import { describe, it, expect } from 'vitest';
import { validateRuleset, parseRulesetYAML } from '../ruleset-validator';
import { mergeRulesets } from '../ruleset-merger';
import { globalRegistry, AtomRegistry } from '../registry';
import type { Ruleset } from '@trpg/shared';

const validRulesetYaml = `
id: test-ruleset-001
name: 测试规则集
version: 1.0.0
atoms:
  my_roll:
    type: dice_roll
  my_compare:
    type: threshold_compare
connections: []
commands:
  check:
    graph:
      nodes:
        - node_id: roll
          atom_type: dice_roll
          inputs:
            expression:
              type: static
              value: "1d20"
        - node_id: out
          atom_type: result_collector
          inputs:
            entries:
              type: static
              value: {}
      output_node_id: out
    description: "技能检定"
character_card_schema:
  attributes:
    type: object
`;

describe('Ruleset Validator', () => {
  it('应能解析合法 YAML 字符串', () => {
    const data = parseRulesetYAML(validRulesetYaml);
    expect(data).toBeTruthy();
    expect((data as Record<string, unknown>)['id']).toBe('test-ruleset-001');
  });

  it('应校验合法的 Ruleset 通过', () => {
    const data = parseRulesetYAML(validRulesetYaml);
    const result = validateRuleset(data, globalRegistry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('应拒绝引用未注册原子类型', () => {
    const data = parseRulesetYAML(`
id: bad-ruleset
name: 坏规则集
version: 1.0.0
atoms:
  my_atom:
    type: nonexistent_atom_type_xyz
connections: []
commands: {}
character_card_schema: {}
`);
    const result = validateRuleset(data, globalRegistry);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('nonexistent_atom_type_xyz'))).toBe(true);
  });

  it('应拒绝缺少必填字段', () => {
    const result = validateRuleset({ name: 'missing fields' }, globalRegistry);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('应拒绝不符合 semver 格式的版本', () => {
    const result = validateRuleset({
      id: 'test',
      name: 'test',
      version: 'not-semver',
      atoms: {},
      connections: [],
      commands: {},
      character_card_schema: {},
    }, new AtomRegistry());
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('version') || e.includes('semver'))).toBe(true);
  });
});

describe('Ruleset Merger', () => {
  const parent: Ruleset = {
    id: 'parent-001',
    name: '父规则集',
    version: '1.0.0',
    parent_ruleset_id: null,
    atoms: { roll: { type: 'dice_roll' }, compare: { type: 'threshold_compare' } },
    connections: [],
    commands: { check: { graph: { nodes: [], output_node_id: 'out' }, description: '父检定' } },
    character_card_schema: { base_field: { type: 'number' } },
    status: 'published',
    created_at: new Date('2024-01-01'),
  };

  it('父子合并：子的 atoms 覆盖父的同名 atom', () => {
    const child: Partial<Ruleset> = {
      id: 'child-001',
      name: '子规则集',
      version: '1.1.0',
      atoms: { roll: { type: 'dice_roll' }, new_atom: { type: 'multiply' } },
      connections: [],
      commands: {},
      character_card_schema: {},
    };
    const merged = mergeRulesets(child, parent);
    const atoms = merged.atoms as Record<string, unknown>;
    expect(Object.keys(atoms)).toContain('roll');
    expect(Object.keys(atoms)).toContain('compare');
    expect(Object.keys(atoms)).toContain('new_atom');
    expect(merged.version).toBe('1.1.0');
  });

  it('父子合并：子新增 command 保留父的 commands', () => {
    const child: Partial<Ruleset> = {
      id: 'child-002',
      name: '子规则集 2',
      version: '2.0.0',
      atoms: {},
      connections: [],
      commands: { attack: { graph: { nodes: [], output_node_id: 'out' }, description: '攻击' } },
      character_card_schema: {},
    };
    const merged = mergeRulesets(child, parent);
    const commands = merged.commands as Record<string, unknown>;
    expect(Object.keys(commands)).toContain('check');  // from parent
    expect(Object.keys(commands)).toContain('attack');  // from child
  });
});
