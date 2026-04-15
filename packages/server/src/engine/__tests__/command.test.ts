import { describe, it, expect } from 'vitest';
import { parseCommand, buildExecuteRequest } from '../command-parser';
import { resolveCommands } from '../command-resolver';
import type { Ruleset } from '@trpg/shared';

describe('Command Parser', () => {
  it('应解析 "/roll 3d6+2" → command: "roll", params: { expression: "3d6+2" }', () => {
    const parsed = parseCommand('/roll 3d6+2');
    expect(parsed.command).toBe('roll');
    expect(parsed.params['expression']).toBe('3d6+2');
  });

  it('应解析 "/check skill=侦查 difficulty=50" → 正确参数', () => {
    const parsed = parseCommand('/check skill=侦查 difficulty=50');
    expect(parsed.command).toBe('check');
    expect(parsed.params['skill']).toBe('侦查');
    expect(parsed.params['difficulty']).toBe('50');
  });

  it('应解析 "/initiative" → 无参数', () => {
    const parsed = parseCommand('/initiative');
    expect(parsed.command).toBe('initiative');
    expect(Object.keys(parsed.params)).toHaveLength(0);
  });

  it('应对不以 "/" 开头的输入抛出错误', () => {
    expect(() => parseCommand('roll 3d6')).toThrow();
  });

  it('应对无效命令名抛出错误', () => {
    expect(() => parseCommand('/123invalid')).toThrow();
  });

  it('buildExecuteRequest 应正确组装 ExecuteRequest', () => {
    const parsed = parseCommand('/roll 2d6');
    const req = buildExecuteRequest(parsed, 'ruleset-001', {
      character_id: 'char-001',
      campaign_id: 'camp-001',
    });
    expect(req.ruleset_id).toBe('ruleset-001');
    expect(req.command).toBe('roll');
    expect(req.context.character_id).toBe('char-001');
  });
});

describe('Command Resolver', () => {
  const emptyRuleset: Ruleset = {
    id: 'r1',
    name: '空规则集',
    version: '1.0.0',
    parent_ruleset_id: null,
    atoms: {},
    connections: {},
    commands: {},
    character_card_schema: {},
    status: 'draft',
    created_at: new Date(),
  };

  it('平台默认命令在无覆盖时可用', () => {
    const commands = resolveCommands(emptyRuleset);
    expect(Object.keys(commands)).toContain('roll');
    expect(Object.keys(commands)).toContain('check');
    expect(Object.keys(commands)).toContain('initiative');
  });

  it('规则集命令覆盖平台默认命令', () => {
    const rulesetWithCustomRoll: Ruleset = {
      ...emptyRuleset,
      commands: {
        roll: {
          graph: { nodes: [], output_node_id: 'out' },
          description: '自定义投骰',
        },
      },
    };
    const commands = resolveCommands(rulesetWithCustomRoll);
    // roll is overridden
    expect(commands['roll'].description).toBe('自定义投骰');
    // other defaults still present
    expect(Object.keys(commands)).toContain('initiative');
  });

  it('规则集新增命令与平台命令并存', () => {
    const rulesetWithAttack: Ruleset = {
      ...emptyRuleset,
      commands: {
        attack: {
          graph: { nodes: [], output_node_id: 'out' },
          description: '攻击',
        },
      },
    };
    const commands = resolveCommands(rulesetWithAttack);
    expect(Object.keys(commands)).toContain('roll');    // default
    expect(Object.keys(commands)).toContain('attack');  // ruleset
  });
});
