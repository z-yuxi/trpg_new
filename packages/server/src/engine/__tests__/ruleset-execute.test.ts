/**
 * 规则集命令执行集成测试
 * 直接调用 RulesetService.executeCommand，无需 HTTP 层
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Ruleset } from '@trpg/shared';

// ─── Mock DB（必须在 service 导入之前）───────────────────────────────────────
const mockRuleset: Ruleset = {
  id: 'rs-test-001',
  author_id: 'user-001',
  name: '克苏鲁的呼唤',
  version: '7.0',
  description: '经典 COC 规则集',
  parent_ruleset_id: null,
  atoms: {},
  connections: {},
  commands: {},
  character_card_schema: {},
  status: 'published',
  created_at: new Date(),
};

const mockCharacter = {
  id: 'char-001',
  attributes: { STR: 60, DEX: 55, INT: 70, POW: 65, CON: 60, APP: 50, EDU: 75, SIZ: 55, LUC: 60 },
  skills: { 侦查: 55, 图书馆使用: 60, 聆听: 40, 潜行: 30 },
  derived_max: { HP: { current: 11, max: 11 }, MP: { current: 13, max: 13 }, SAN: { current: 65, max: 99 } },
};

vi.mock('../../db', () => ({
  db: (table: string) => {
    if (table === 'rulesets') {
      return {
        where: (_cond: unknown) => ({
          first: async () => mockRuleset,
        }),
      };
    }
    if (table === 'character_sheets') {
      return {
        where: (_cond: unknown) => ({
          first: async () => mockCharacter,
        }),
      };
    }
    return { where: () => ({ first: async () => null }) };
  },
}));

import { RulesetService } from '../../services/ruleset-service';

describe('RulesetService.executeCommand — 集成测试', () => {
  let service: RulesetService;

  beforeEach(() => {
    service = new RulesetService();
  });

  it('测试1: 平台预置 roll 命令 — 骰子表达式执行', async () => {
    const result = await service.executeCommand('rs-test-001', {
      command: '/roll',
      params: { expression: '1d6' },
      mock_context: {
        attributes: {},
        skills: {},
        resources: {},
      },
    });

    expect(result.success).toBe(true);
    expect(result.logs).toBeInstanceOf(Array);
    expect(result.logs.length).toBeGreaterThan(0);
    expect(result.dice_rolls).toBeInstanceOf(Array);
    // result 字段为可读描述字符串
    expect(typeof result.result).toBe('string');
  });

  it('测试2: 平台预置 check 命令 — 1d100 检定与阈值比较', async () => {
    const result = await service.executeCommand('rs-test-001', {
      command: '/check',
      params: { threshold: 55 },
      mock_context: { attributes: {}, skills: {}, resources: {} },
    });

    expect(result.success).toBe(true);
    // 至少包含 dice_roll, threshold_compare 两个节点日志
    expect(result.logs.length).toBeGreaterThanOrEqual(2);
    // 日志中包含 dice_roll 节点（atom_type 字段）
    const diceLog = result.logs.find((l) => l.atom_type === 'dice_roll');
    expect(diceLog).toBeDefined();
    const rollOutput = diceLog!.output as { total: number };
    expect(typeof rollOutput.total).toBe('number');
    expect(rollOutput.total).toBeGreaterThanOrEqual(1);
    expect(rollOutput.total).toBeLessThanOrEqual(100);
  });

  it('测试3: 规则集自定义命令 — 条件分支（if_else 原子）', async () => {
    // 覆盖 mockRuleset 的 commands 为自定义命令
    const customGraph = {
      nodes: [
        {
          node_id: 'branch',
          atom_type: 'if_else',
          inputs: {
            condition: { type: 'static', value: true }, // 强制走 then 分支
            then_value: { type: 'static', value: '成功' },
            else_value: { type: 'static', value: '失败' },
          },
        },
      ],
      output_node_id: 'branch',
    };

    // 临时将 mockRuleset.commands 替换为含 custom_check 的版本
    const originalCommands = mockRuleset.commands;
    (mockRuleset as { commands: object }).commands = {
      custom_check: { graph: customGraph, description: '自定义条件检定' },
    };

    try {
      const result = await service.executeCommand('rs-test-001', {
        command: '/custom_check',
        mock_context: { attributes: {}, skills: {}, resources: {} },
      });

      expect(result.success).toBe(true);
      const branchLog = result.logs.find((l) => l.atom_type === 'if_else');
      expect(branchLog).toBeDefined();
      const branchOutput = branchLog!.output as { value: string; branch: string };
      // condition=true → 走 then 分支 → value='成功'
      expect(branchOutput.value).toBe('成功');
      expect(branchOutput.branch).toBe('then');
    } finally {
      (mockRuleset as { commands: object }).commands = originalCommands;
    }
  });

  it('测试4: 未知命令 — 应抛出 NOT_FOUND 错误', async () => {
    await expect(
      service.executeCommand('rs-test-001', {
        command: '/nonexistent_command_xyz',
        mock_context: { attributes: {}, skills: {}, resources: {} },
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
