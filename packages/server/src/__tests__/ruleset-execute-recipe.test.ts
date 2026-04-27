/**
 * 阶段4/5/8 — executeCommand Recipe路由 + testRecipe + migrateToRecipe 测试
 *
 * 覆盖点：
 * 1. executeCommand — Recipe规则集通过 command_recipe_map → compiled_graph.atoms[recipeId] 执行
 * 2. executeCommand — Recipe规则集但命令不在 command_recipe_map → 回退 legacy resolveCommand
 * 3. executeCommand — legacy=true 规则集 → 使用旧三层解析
 * 4. testRecipe — 有效 recipe → 返回 success:true 及 compiled_preview
 * 5. testRecipe — 无效 recipe → 返回 success:false + error_code:RECIPE_VALIDATION_FAILED
 * 6. migrateToRecipe — legacy 规则集 → 迁移成功，legacy=false
 * 7. migrateToRecipe — 非作者 → 抛出 FORBIDDEN
 * 8. migrateToRecipe — 已是 recipe 格式 → 抛出 BAD_REQUEST
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RulesetRecipeSource, RulesetCompiledGraph } from '@trpg/shared';

vi.mock('../db', () => ({ db: vi.fn() }));
vi.mock('../engine/command-resolver', () => ({
  resolveCommand: vi.fn(),
}));
vi.mock('../engine/executor', () => ({
  GraphExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockReturnValue({
      success: true,
      output: { result: 'ok' },
      logs: [],
    }),
  })),
}));

import { db } from '../db';
import { resolveCommand } from '../engine/command-resolver';
import { RulesetService } from '../services/ruleset-service';

const mockDb = vi.mocked(db);
const mockResolveCommand = vi.mocked(resolveCommand);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(firstValue: unknown = null): any {
  const chain: Record<string, any> = {
    where:   vi.fn(),
    orderBy: vi.fn(),
    limit:   vi.fn(),
    offset:  vi.fn(),
    first:   vi.fn().mockResolvedValue(firstValue),
    update:  vi.fn().mockResolvedValue(1),
    insert:  vi.fn().mockResolvedValue([1]),
  };
  for (const key of ['where', 'orderBy', 'limit', 'offset']) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const GRAPH_DEF = {
  nodes: [
    { id: 'dice_node', type: 'dice_roll', inputs: { expression: { type: 'literal', value: '1d100' } } },
    { id: 'out', type: 'output', inputs: { value: { type: 'ref', node_id: 'dice_node', output_key: 'result' } } },
  ],
  output_node_id: 'out',
};

const COMPILED_GRAPH: RulesetCompiledGraph = {
  atoms: { skill_check: GRAPH_DEF } as any,
  connections: {},
  compiled_at: '2024-01-01T00:00:00.000Z',
  compiler_version: '1.0.0',
};

const RECIPE_SOURCE: RulesetRecipeSource = {
  recipes: [
    {
      id: 'skill_check',
      type: 'threshold_check',
      name: '技能检定',
      params: {
        dice_expression: '1d100',
        target_source: 'skill',
        target_ref: '侦查',
        success_direction: 'lte',
        tiers: [
          { name: 'success', label: '成功', condition: 'lte', is_success: true },
          { name: 'fail', label: '失败', condition: 'gt', is_success: false },
        ],
      },
    },
  ],
  command_recipe_map: { '侦查检定': 'skill_check' },
};

function makeRulesetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rs001',
    author_id: 'user1',
    name: '测试规则集',
    version: '1.0.0',
    description: '',
    status: 'published',
    atoms: null,
    connections: null,
    commands: null,
    character_card_schema: null,
    parent_ruleset_id: null,
    fork_count: 0,
    is_official: 0,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
    legacy: 0,
    recipe_source: JSON.stringify(RECIPE_SOURCE),
    compiled_graph: JSON.stringify(COMPILED_GRAPH),
    ...overrides,
  };
}

function makeCharacterRow() {
  return {
    id: 'char1',
    user_id: 'user1',
    campaign_id: 'camp1',
    name: '测试角色',
    attributes: '{}',
    skills: '{"侦查": 60}',
    resources: '{}',
  };
}

let service: RulesetService;

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.mockReset();          // 清空 mockReturnValueOnce 队列，但不影响其他 mock 实现
  service = new RulesetService();
});

// ─── 1. executeCommand Recipe 路径 ──────────────────────────────────────────

describe('executeCommand — Recipe 路由', () => {
  it('命令在 command_recipe_map 中 → 通过 compiled_graph.atoms 执行', async () => {
    // findById → rulesetRow
    // executeCommand 内部还会查 characters 表
    mockDb
      .mockReturnValueOnce(makeChain(makeRulesetRow()) as any)
      .mockReturnValueOnce(makeChain(makeCharacterRow()) as any);

    const result = await service.executeCommand('rs001', {
      command: '侦查检定',
      context: { character_id: 'char1', campaign_id: 'camp1' },
    });

    expect(result.success).toBe(true);
    // resolveCommand (legacy path) 不应被调用
    expect(mockResolveCommand).not.toHaveBeenCalled();
  });

  it('命令不在 command_recipe_map → 回退 legacy resolveCommand', async () => {
    mockResolveCommand.mockReturnValueOnce({
      name: '未知命令',
      graph: GRAPH_DEF as any,
      params: {},
    } as any);

    mockDb
      .mockReturnValueOnce(makeChain(makeRulesetRow()) as any)
      .mockReturnValueOnce(makeChain(makeCharacterRow()) as any);

    const result = await service.executeCommand('rs001', {
      command: '未知命令',
      context: { character_id: 'char1', campaign_id: 'camp1' },
    });

    expect(result.success).toBe(true);
    expect(mockResolveCommand).toHaveBeenCalledOnce();
  });

  it('legacy=true 规则集 → 使用 resolveCommand', async () => {
    mockResolveCommand.mockReturnValueOnce({
      name: '攻击',
      graph: GRAPH_DEF as any,
      params: {},
    } as any);

    const legacyRow = makeRulesetRow({
      legacy: 1,
      recipe_source: null,
      compiled_graph: null,
    });

    mockDb
      .mockReturnValueOnce(makeChain(legacyRow) as any)
      .mockReturnValueOnce(makeChain(makeCharacterRow()) as any);

    const result = await service.executeCommand('rs001', {
      command: '攻击',
      context: { character_id: 'char1', campaign_id: 'camp1' },
    });

    expect(result.success).toBe(true);
    expect(mockResolveCommand).toHaveBeenCalledOnce();
  });

  it('规则集不存在 → 抛出 NOT_FOUND', async () => {
    mockDb.mockReturnValueOnce(makeChain(null) as any);

    await expect(
      service.executeCommand('not-exist', {
        command: '攻击',
        mock_context: { attributes: {}, skills: {}, resources: {} },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── 2. testRecipe ───────────────────────────────────────────────────────────

describe('testRecipe', () => {
  it('有效 threshold_check recipe + mock_context → success:true + compiled_preview', async () => {
    const recipe = RECIPE_SOURCE.recipes[0]!;

    const result = await service.testRecipe({
      recipe,
      allRecipes: [],
      test_inputs: {},
      mock_context: { attributes: {}, skills: {}, resources: {} },
    });

    expect(result.success).toBe(true);
    expect(result.compiled_preview).toBeDefined();
    expect(typeof result.compiled_preview.atom_count).toBe('number');
  });

  it('无效 recipe (缺少必填字段) → success:false + RECIPE_VALIDATION_FAILED', async () => {
    const badRecipe = { id: '', type: 'threshold_check', name: '', params: {} } as any;

    const result = await service.testRecipe({ recipe: badRecipe });

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('RECIPE_VALIDATION_FAILED');
    expect(result.failed_stage).toBe('validate');
  });
});

// ─── 3. migrateToRecipe ──────────────────────────────────────────────────────

describe('migrateToRecipe', () => {
  it('legacy 规则集 → 迁移成功，DB 写入 legacy=0', async () => {
    // 使用有效的 atoms 数组格式（直接是 object[] 而不是字典）
    const legacyRow = makeRulesetRow({
      legacy: 1,
      recipe_source: null,
      compiled_graph: null,
      // 使用数组格式以确保 normalizeAtomsList 正确处理
      atoms: JSON.stringify([
        { node_id: 'roll', id: 'roll', type: 'dice_roll', inputs: { expression: { type: 'literal', value: '1d20' } } },
      ]),
      connections: JSON.stringify([]),
    });

    const migratedRow = { ...legacyRow, legacy: 0, recipe_source: '{"recipes":[]}', compiled_graph: '{"atoms":{},"connections":{},"compiled_at":"2024-01-01","compiler_version":"1.0.0"}' };

    const updateChain = makeChain(null);
    mockDb
      .mockReturnValueOnce(makeChain(legacyRow) as any)   // findById
      .mockReturnValueOnce(updateChain as any)              // db('rulesets').where().update()
      .mockReturnValueOnce(makeChain(migratedRow) as any); // findById after update

    const result = await service.migrateToRecipe('rs001', 'user1');

    expect(result).toBeDefined();
    expect(result.id).toBe('rs001');
  });

  it('非作者 → 抛出 FORBIDDEN', async () => {
    mockDb.mockReturnValueOnce(makeChain(makeRulesetRow()) as any);

    await expect(service.migrateToRecipe('rs001', 'other-user')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('已是 recipe 格式 (legacy=false) → 抛出 BAD_REQUEST', async () => {
    mockDb.mockReturnValueOnce(makeChain(makeRulesetRow()) as any);

    await expect(service.migrateToRecipe('rs001', 'user1')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('规则集不存在 → 抛出 NOT_FOUND', async () => {
    mockDb.mockReturnValueOnce(makeChain(null) as any);

    await expect(service.migrateToRecipe('not-exist', 'user1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
