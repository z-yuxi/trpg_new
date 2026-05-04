/**
 * command-resolver.test.ts
 * 覆盖三层解析优先级：自定义 > 预置 > 通用（至少 6 个用例）
 * 同时验证 mock_context 执行路径（API 集成测试）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Ruleset } from '@trpg/shared';

// ── 公共 fixtures ──────────────────────────────────────────────────────
const baseRuleset: Ruleset = {
  id: 'rs-resolve-test',
  author_id: 'user-001',
  name: '测试规则集',
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

// ── resolveCommand 单元测试 ──────────────────────────────────────────────
import { resolveCommand } from '../command-resolver';

describe('resolveCommand — 三层解析优先级', () => {
  it('用例1：通用命令 /r 属于第三层（general），始终可用', () => {
    const result = resolveCommand('/r 2d6', baseRuleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('general');
    expect(result!.name).toBe('r');
  });

  it('用例2：暗骰 /rh 属于第三层（general）', () => {
    const result = resolveCommand('/rh 1d20', baseRuleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('general');
    expect(result!.name).toBe('rh');
  });

  it('用例3：平台预置命令 /rc 属于第二层（preset）', () => {
    const result = resolveCommand('/rc', baseRuleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('preset');
  });

  it('用例4：自定义命令优先于同名预置命令（第一层 > 第二层）', () => {
    const rulesetWithCustomRc: Ruleset = {
      ...baseRuleset,
      commands: {
        custom_commands: [
          {
            trigger: 'rc',
            aliases: [],
            description: '自定义rc覆盖预置',
            graph: { nodes: [{ node_id: 'out', atom_type: 'result_collector', inputs: { entries: { type: 'static', value: {} } } }], output_node_id: 'out' },
          },
        ],
      } as object,
    };
    const result = resolveCommand('/rc 侦查', rulesetWithCustomRc);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('custom');
    expect(result!.description).toBe('自定义rc覆盖预置');
  });

  it('用例5：通过别名触发自定义命令（第一层）', () => {
    const ruleset: Ruleset = {
      ...baseRuleset,
      commands: {
        custom_commands: [
          {
            trigger: 'attack',
            aliases: ['atk'],
            description: '攻击',
            graph: { nodes: [{ node_id: 'dice', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d6' } } }], output_node_id: 'dice' },
          },
        ],
      } as object,
    };
    const result = resolveCommand('/atk 目标', ruleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('custom');
    expect(result!.name).toBe('attack');   // trigger，非 alias
  });

  it('用例6：未知命令返回 null（三层均无匹配）', () => {
    const result = resolveCommand('/nonexistent_cmd_xyz', baseRuleset);
    expect(result).toBeNull();
  });

  it('用例7：/rc 的 param_map 将 arg0 映射为 field_name', () => {
    const result = resolveCommand('/rc 侦查 60', baseRuleset);
    expect(result).not.toBeNull();
    expect(result!.parsedParams['field_name']).toBe('侦查');
    expect(result!.parsedParams['arg1']).toBe('60');
  });

  it('用例8：/ra 属性检定属于第二层（preset）且有 param_map', () => {
    const result = resolveCommand('/ra 力量', baseRuleset);
    expect(result).not.toBeNull();
    expect(result!.layer).toBe('preset');
    expect(result!.parsedParams['field_name']).toBe('力量');
  });
});

// ── executeCommand + mock_context 集成测试 ────────────────────────────────
const mockRulesetForExec: Ruleset = {
  ...baseRuleset,
  id: 'rs-exec-test',
  status: 'published',
};

vi.mock('../../db', () => ({
  db: (table: string) => {
    if (table === 'rulesets') {
      return {
        where: () => ({ first: async () => mockRulesetForExec }),
      };
    }
    return { where: () => ({ first: async () => null }) };
  },
}));

import { RulesetService } from '../../services/ruleset-service';

describe('executeCommand + mock_context — API 集成', () => {
  let service: RulesetService;
  beforeEach(() => { service = new RulesetService(); });

  it('mock_context 执行 /roll — 应返回合法 ExecuteResponse', async () => {
    const result = await service.executeCommand('rs-exec-test', {
      command: '/roll',
      mock_context: { attributes: {}, skills: {}, resources: {} },
    });
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe('string');
    expect(Array.isArray(result.dice_rolls)).toBe(true);
    expect(Array.isArray(result.logs)).toBe(true);
    expect(result.logs.length).toBeGreaterThan(0);
    // logs 字段应有 node_type（NodeExecutionLog 的字段名）
    expect(result.logs[0]).toHaveProperty('node_type');
    expect(result.logs[0]).toHaveProperty('node_id');
    expect(result.logs[0]).toHaveProperty('inputs');
    expect(result.logs[0]).toHaveProperty('output');
    expect(result.logs[0]).toHaveProperty('duration_ms');
  });

  it('mock_context 执行 /ds（死亡豁免）— 返回 passed 布尔结果', async () => {
    const result = await service.executeCommand('rs-exec-test', {
      command: '/ds',
      mock_context: { attributes: {}, skills: {}, resources: {} },
    });
    expect(result.success).toBe(true);
    expect(result.dice_rolls.length).toBeGreaterThan(0);
    const diceVal = result.dice_rolls[0].value;
    expect(diceVal).toBeGreaterThanOrEqual(1);
    expect(diceVal).toBeLessThanOrEqual(20);
    // result 文字应为 "成功" 或 "失败"
    expect(['成功', '失败']).toContain(result.result);
  });

  it('mock_context 中技能数据注入后 /rc 能正确执行检定', async () => {
    // /rc 命令使用 character_skill_reader field_type='attribute'，
    // 因此数据需在 attributes 对象中提供，而非 skills
    const result = await service.executeCommand('rs-exec-test', {
      command: '/rc field_name=侦查',
      mock_context: {
        attributes: { 侦查: 70 },
        skills: {},
        resources: {},
      },
    });
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe('string');
    expect(['成功', '失败']).toContain(result.result);
  });

  it('context 和 mock_context 均缺失时不应崩溃（无 character_skill_reader 的命令）', async () => {
    // /r 命令不需要角色数据
    const result = await service.executeCommand('rs-exec-test', {
      command: '/r 2d6',
      // 不提供 context 也不提供 mock_context
    });
    expect(result.success).toBe(true);
  });
});
