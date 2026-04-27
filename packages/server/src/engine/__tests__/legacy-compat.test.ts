/**
 * 阶段1 server 侧 legacy 兼容测试
 *
 * 覆盖点：
 * 1. 旧 atoms/connections 格式的规则集能被包装成 raw recipe
 * 2. 包装后的 legacy recipe_source 可正确标识为 legacy
 * 3. 旧格式规则集通过 service.executeCommand 仍能执行（不因新字段引入而崩溃）
 * 4. 迁移包装函数的 entry/output 推断行为
 */
import { describe, it, expect, vi } from 'vitest';
import type { Ruleset } from '@trpg/shared';
import {
  wrapLegacyGraphAsRawRecipe,
  buildLegacyRecipeSource,
  isLegacyRuleset,
} from '@trpg/shared';
import type { RawRecipeParams } from '@trpg/shared';

// ─── 旧格式 Ruleset Fixture ──────────────────────────────────────────────────

const legacyRuleset: Ruleset = {
  id: 'legacy-rs-001',
  author_id: 'user-001',
  name: '老格式规则集',
  version: '1.0.0',
  description: '使用旧 atoms/connections 格式',
  parent_ruleset_id: null,
  atoms: {
    roll_node: { type: 'dice_roll' },
    compare_node: { type: 'threshold_compare' },
    output_node: { type: 'result_collector' },
  },
  connections: [
    { source: 'roll_node', target: 'compare_node', sourceHandle: 'result', targetHandle: 'roll' },
    { source: 'compare_node', target: 'output_node', sourceHandle: 'result', targetHandle: 'entries' },
  ],
  commands: {
    check: {
      graph: {
        nodes: [
          { node_id: 'roll', atom_type: 'dice_roll', inputs: { expression: { type: 'static', value: '1d100' } } },
          { node_id: 'out', atom_type: 'result_collector', inputs: { entries: { type: 'static', value: {} } } },
        ],
        output_node_id: 'out',
      },
    },
  },
  character_card_schema: {},
  status: 'published',
  created_at: new Date(),
  // 旧格式没有 recipe_source 和 compiled_graph
};

// ─── Mock DB ─────────────────────────────────────────────────────────────────

vi.mock('../../db', () => ({
  db: (table: string) => {
    if (table === 'rulesets') {
      return {
        where: () => ({ first: async () => legacyRuleset }),
      };
    }
    return { where: () => ({ first: async () => null }) };
  },
}));

import { RulesetService } from '../../services/ruleset-service';

// ─── 测试 ─────────────────────────────────────────────────────────────────────

describe('阶段1 — Legacy 规则集兼容性', () => {
  describe('isLegacyRuleset 判断', () => {
    it('旧格式规则集应被识别为 legacy', () => {
      expect(isLegacyRuleset(legacyRuleset)).toBe(true);
    });

    it('带有 recipe_source 的规则集不是 legacy', () => {
      const newRuleset: Partial<Ruleset> = {
        recipe_source: { recipes: [] },
        atoms: {},
        connections: {},
      };
      expect(isLegacyRuleset(newRuleset as Ruleset)).toBe(false);
    });
  });

  describe('wrapLegacyGraphAsRawRecipe', () => {
    it('应生成 raw 类型配方，含所有原子节点', () => {
      const recipe = wrapLegacyGraphAsRawRecipe(
        legacyRuleset.atoms,
        legacyRuleset.connections,
      );
      expect(recipe.type).toBe('raw');
      const params = recipe.params as RawRecipeParams;
      expect(params.atoms).toHaveLength(3);
      const ids = params.atoms.map((a) => (a as Record<string, unknown>)['node_id'] as string);
      expect(ids).toContain('roll_node');
      expect(ids).toContain('compare_node');
      expect(ids).toContain('output_node');
    });

    it('应自动推断 entry_atom_id 为无入边节点 roll_node', () => {
      const recipe = wrapLegacyGraphAsRawRecipe(
        legacyRuleset.atoms,
        legacyRuleset.connections,
      );
      expect((recipe.params as RawRecipeParams).entry_atom_id).toBe('roll_node');
    });

    it('应自动推断 output_atom_id 为无出边节点 output_node', () => {
      const recipe = wrapLegacyGraphAsRawRecipe(
        legacyRuleset.atoms,
        legacyRuleset.connections,
      );
      expect((recipe.params as RawRecipeParams).output_atom_id).toBe('output_node');
    });
  });

  describe('buildLegacyRecipeSource', () => {
    it('应生成 legacy=true 且 migration_status=pending 的结果', () => {
      const result = buildLegacyRecipeSource(
        legacyRuleset.atoms,
        legacyRuleset.connections,
        legacyRuleset.commands,
      );
      expect(result.legacy).toBe(true);
      expect(result.legacy_meta.migration_status).toBe('pending');
      expect(result.legacy_meta.origin).toBe('raw_recipe_wrapped');
    });

    it('包装后 recipe_source.recipes 应包含一个 raw recipe', () => {
      const result = buildLegacyRecipeSource(
        legacyRuleset.atoms,
        legacyRuleset.connections,
      );
      expect(result.recipe_source.recipes).toHaveLength(1);
      expect(result.recipe_source.recipes[0].id).toBe('__legacy_graph__');
    });
  });

  describe('旧格式规则集 executeCommand 兼容性', () => {
    it('旧 commands 格式执行命令不应因新字段引入而崩溃', async () => {
      const service = new RulesetService();
      const result = await service.executeCommand('legacy-rs-001', {
        command: '/check',
        mock_context: {
          attributes: { STR: 60 },
          skills: { 侦查: 55 },
          resources: {},
        },
      });
      // 旧格式命令能执行（成功或失败均可，但不能抛异常）
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.logs).toBeInstanceOf(Array);
    });
  });
});
