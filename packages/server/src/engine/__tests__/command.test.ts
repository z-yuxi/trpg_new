import { describe, it, expect } from 'vitest';
import { parseCommand, buildExecuteRequest } from '../command-parser';
import { resolveCommands, resolveCommand } from '../command-resolver';
import type { Ruleset } from '@trpg/shared';

const emptyRuleset: Ruleset = {
  id: 'r1',
  author_id: null,
  name: '空规则集',
  version: '1.0.0',
  description: '',
  parent_ruleset_id: null,
  atoms: {},
  connections: {},
  commands: {},
  character_card_schema: {},
  status: 'draft',
  created_at: new Date(),
};

describe('Command Parser', () => {
  it('应解析 "/roll 3d6+2" → command: "roll", params: { expression: "3d6+2" }', () => {
    const parsed = parseCommand('/roll 3d6+2');
    expect(parsed.command).toBe('roll');
    expect(parsed.params['expression']).toBe('3d6+2');
  });

  it('应解析 "/check skill=侦查 difficulty=50" → 正确参数（key=value 格式）', () => {
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

  it('位置参数应同时提供 expression 和 arg0/arg1', () => {
    const parsed = parseCommand('/rc 侦查 60');
    expect(parsed.command).toBe('rc');
    expect(parsed.params['expression']).toBe('侦查 60');
    expect(parsed.params['arg0']).toBe('侦查');
    expect(parsed.params['arg1']).toBe('60');
  });

  it('应对不以 "/" 开头的输入抛出错误', () => {
    expect(() => parseCommand('roll 3d6')).toThrow();
  });

  it('应对无效命令名抛出错误', () => {
    expect(() => parseCommand('/123invalid')).toThrow();
  });

  it('buildExecuteRequest 应正确组装 ExecuteRequest（新格式，不含 ruleset_id）', () => {
    const parsed = parseCommand('/roll 2d6');
    const req = buildExecuteRequest(parsed, {
      character_id: 'char-001',
      campaign_id: 'camp-001',
    });
    expect(req.command).toBe('roll');
    expect(req.context?.character_id).toBe('char-001');
    // 新格式：不含 ruleset_id
    expect((req as unknown as Record<string, unknown>)['ruleset_id']).toBeUndefined();
  });
});

describe('Command Resolver — resolveCommands（向后兼容）', () => {
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
    expect(commands['roll'].description).toBe('自定义投骰');
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
    expect(Object.keys(commands)).toContain('roll');
    expect(Object.keys(commands)).toContain('attack');
  });
});

describe('Command Resolver — resolveCommand（三层解析）', () => {
  it('通用命令 /r 始终可用（第三层）', () => {
    const result = resolveCommand('/r 2d6', emptyRuleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('general');
    expect(result!.name).toBe('r');
  });

  it('平台预置命令 /rc 在空规则集中可用（第二层，允许所有预置）', () => {
    const result = resolveCommand('/rc', emptyRuleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('preset');
    expect(result!.name).toBe('rc');
  });

  it('自定义命令优先于预置命令（第一层 > 第二层）', () => {
    const rulesetWithCustomRc: Ruleset = {
      ...emptyRuleset,
      commands: {
        custom_commands: [
          { trigger: 'rc', aliases: [], description: '自定义rc', graph: { nodes: [], output_node_id: 'out' } },
        ],
      } as object,
    };
    const result = resolveCommand('/rc 侦查', rulesetWithCustomRc);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('custom');
    expect(result!.description).toBe('自定义rc');
  });

  it('自定义命令可通过 alias 触发', () => {
    const ruleset: Ruleset = {
      ...emptyRuleset,
      commands: {
        custom_commands: [
          { trigger: 'attack', aliases: ['atk', 'a'], description: '攻击', graph: { nodes: [], output_node_id: 'out' } },
        ],
      } as object,
    };
    const result = resolveCommand('/atk 目标', ruleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('custom');
    expect(result!.name).toBe('attack');
  });

  it('param_map 应将位置参数映射为具名参数', () => {
    const result = resolveCommand('/rc 侦查 60', emptyRuleset);
    expect(result).not.toBeNull();
    // rc 的 param_map 将 arg0 → field_name
    expect(result!.parsedParams['field_name']).toBe('侦查');
    expect(result!.parsedParams['arg0']).toBe('侦查');
  });

  it('用例6：未知命令返回 null（三层均无匹配）', () => {
    const result = resolveCommand('/nonexistent_cmd_xyz', emptyRuleset);
    expect(result).toBeNull();
  });
});

