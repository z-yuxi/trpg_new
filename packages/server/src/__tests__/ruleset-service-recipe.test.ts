/**
 * 阶段3 — ruleset-service Recipe 主线测试
 *
 * 覆盖点：
 * 1. rowToRuleset 正确解析 recipe_source / compiled_graph / legacy 字段
 * 2. create() 提交 recipe_source → 自动 validate+compile 写入 compiled_graph
 * 3. create() 提交非法 recipe_source → 抛出 RECIPE_VALIDATION_FAILED + 结构化 errors
 * 4. update() 提交 recipe_source → 重新 compile，更新 compiled_graph
 * 5. update() 提交非法 recipe_source → 抛出 RECIPE_VALIDATION_FAILED
 * 6. saveVersion() 快照包含 recipe_source 和 compiled_graph
 * 7. rollbackToVersion() 从含 recipe_source 的快照恢复
 * 8. 旧格式 ruleset（无 recipe_source）create/find 仍正常工作
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RulesetRecipeSource } from '@trpg/shared';

// vi.mock 会被 vitest 自动提升到文件顶部
vi.mock('../db', () => ({ db: vi.fn() }));

import { db } from '../db';
import { RulesetService } from '../services/ruleset-service';

const mockDb = vi.mocked(db);

// ─── Knex 链 mock 工具 ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeChain(firstValue: unknown = null, resolveRows: unknown[] = []): any {
  const rowsPromise = Promise.resolve(resolveRows);
  const chain: Record<string, any> = {
    where:   vi.fn(),
    orderBy: vi.fn(),
    limit:   vi.fn(),
    offset:  vi.fn(),
    clone:   vi.fn(),
    count:   vi.fn(),
    first:   vi.fn().mockResolvedValue(firstValue),
    update:  vi.fn().mockResolvedValue(1),
    insert:  vi.fn().mockResolvedValue([1]),
    then:    rowsPromise.then.bind(rowsPromise),
    catch:   rowsPromise.catch.bind(rowsPromise),
  };
  for (const key of ['where', 'orderBy', 'limit', 'offset', 'clone', 'count']) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_RECIPE_SOURCE: RulesetRecipeSource = {
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
        difficulty: { mode: 'divisor', divisors: [1, 2, 5], default_level: 0 },
        tiers: [
          { name: 'success', label: '成功', condition: 'roll <= target', is_success: true },
          { name: 'fail', label: '失败', condition: 'true', is_success: false },
        ],
      },
    },
  ],
};

const INVALID_RECIPE_SOURCE: RulesetRecipeSource = {
  recipes: [
    {
      id: 'broken',
      type: 'threshold_check',
      name: '残缺',
      params: {
        // 缺少 dice_expression / target_source 等必填字段
      } as any,
    },
  ],
};

/** 模拟 DB 行（旧格式，无 recipe_source） */
const LEGACY_ROW = {
  id: 'rs-legacy-001',
  author_id: 'user-001',
  name: '旧格式规则集',
  version: '1.0.0',
  description: '',
  parent_ruleset_id: null,
  atoms: JSON.stringify({ roll: { type: 'dice_roll' } }),
  connections: JSON.stringify([]),
  commands: JSON.stringify({}),
  character_card_schema: JSON.stringify({}),
  status: 'draft',
  created_at: new Date(),
  recipe_source: null,
  compiled_graph: null,
  legacy: 1,
};

/** 模拟 DB 行（新 Recipe 格式） */
function makeRecipeRow(recipeSource: object, compiledGraph: object) {
  return {
    id: 'rs-recipe-001',
    author_id: 'user-001',
    name: 'Recipe规则集',
    version: '1.0.0',
    description: '',
    parent_ruleset_id: null,
    atoms: JSON.stringify({}),
    connections: JSON.stringify({}),
    commands: JSON.stringify({}),
    character_card_schema: JSON.stringify({}),
    status: 'draft',
    created_at: new Date(),
    recipe_source: JSON.stringify(recipeSource),
    compiled_graph: JSON.stringify(compiledGraph),
    legacy: 0,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RulesetService — Phase 3 Recipe 主线', () => {
  let service: RulesetService;

  beforeEach(() => {
    service = new RulesetService();
    vi.clearAllMocks();
  });

  // ── rowToRuleset 解析 ──────────────────────────────────────────────────────

  describe('findById() — rowToRuleset 解析新字段', () => {
    it('旧格式行：legacy=true, recipe_source=null, compiled_graph=null', async () => {
      mockDb.mockReturnValue(makeChain(LEGACY_ROW));
      const ruleset = await service.findById('rs-legacy-001');
      expect(ruleset).not.toBeNull();
      expect(ruleset!.legacy).toBe(true);
      expect(ruleset!.recipe_source).toBeNull();
      expect(ruleset!.compiled_graph).toBeNull();
      expect(ruleset!.legacy_meta?.origin).toBe('atoms_connections');
    });

    it('Recipe 格式行：legacy=false, recipe_source 和 compiled_graph 被解析', async () => {
      const recipeSource = VALID_RECIPE_SOURCE;
      const compiledGraph = { atoms: {}, connections: {}, compiled_at: '', compiler_version: '1.0.0' };
      mockDb.mockReturnValue(makeChain(makeRecipeRow(recipeSource, compiledGraph)));

      const ruleset = await service.findById('rs-recipe-001');
      expect(ruleset).not.toBeNull();
      expect(ruleset!.legacy).toBe(false);
      expect(ruleset!.recipe_source).toEqual(recipeSource);
      expect(ruleset!.compiled_graph).toEqual(compiledGraph);
      expect(ruleset!.legacy_meta).toBeNull();
    });

    it('legacy 列为 0 时 legacy=false', async () => {
      const row = { ...LEGACY_ROW, legacy: 0 };
      mockDb.mockReturnValue(makeChain(row));
      const ruleset = await service.findById('rs-001');
      expect(ruleset!.legacy).toBe(false);
    });
  });

  // ── create() ──────────────────────────────────────────────────────────────

  describe('create() — 无 recipe_source（旧 legacy 路径）', () => {
    it('不传 recipe_source 时插入 legacy=1，compiled_graph=null', async () => {
      const chain = makeChain(LEGACY_ROW);
      mockDb.mockReturnValue(chain);

      await service.create({
        name: '新规则集',
        version: '1.0.0',
        author_id: 'user-001',
      });

      // 验证 insert 被调用且包含 legacy=1
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ legacy: 1, recipe_source: null, compiled_graph: null }),
      );
    });
  });

  describe('create() — 有效 recipe_source（Recipe 主线）', () => {
    it('传入有效 recipe_source → 自动编译，insert 含 compiled_graph 且 legacy=0', async () => {
      const recipeRow = makeRecipeRow(VALID_RECIPE_SOURCE, {});
      const chain = makeChain(recipeRow);
      mockDb.mockReturnValue(chain);

      await service.create({
        name: 'Recipe规则集',
        version: '1.0.0',
        author_id: 'user-001',
        recipe_source: VALID_RECIPE_SOURCE,
      });

      const insertArg = chain.insert.mock.calls[0][0] as Record<string, unknown>;
      expect(insertArg['legacy']).toBe(0);
      expect(typeof insertArg['recipe_source']).toBe('string');
      const storedSource = JSON.parse(insertArg['recipe_source'] as string);
      expect(storedSource.recipes[0].id).toBe('skill_check');
      // compiled_graph 不为 null
      expect(insertArg['compiled_graph']).not.toBeNull();
      const compiledGraph = JSON.parse(insertArg['compiled_graph'] as string);
      expect(compiledGraph.compiler_version).toBe('1.0.0');
      expect(compiledGraph.compiled_at).toBeTruthy();
    });
  });

  describe('create() — 非法 recipe_source', () => {
    it('非法 recipe_source → 抛出 RECIPE_VALIDATION_FAILED，errors 非空', async () => {
      // DB 不应被调用，直接在 compileRecipeSource 阶段就应失败
      await expect(
        service.create({
          name: '残缺规则集',
          version: '1.0.0',
          author_id: 'user-001',
          recipe_source: INVALID_RECIPE_SOURCE,
        }),
      ).rejects.toMatchObject({
        code: 'RECIPE_VALIDATION_FAILED',
        errors: expect.arrayContaining([expect.objectContaining({ code: expect.any(String) })]),
      });
    });

    it('非法 recipe_source → DB insert 不被调用', async () => {
      const chain = makeChain();
      mockDb.mockReturnValue(chain);

      try {
        await service.create({
          name: '残缺规则集',
          version: '1.0.0',
          author_id: 'user-001',
          recipe_source: INVALID_RECIPE_SOURCE,
        });
      } catch {
        // 预期抛出
      }

      expect(chain.insert).not.toHaveBeenCalled();
    });
  });

  // ── update() ──────────────────────────────────────────────────────────────

  describe('update() — 有效 recipe_source', () => {
    it('update 传入有效 recipe_source → legacy=0，compiled_graph 被写入', async () => {
      const existingRow = { ...LEGACY_ROW, status: 'draft' };
      const chain = makeChain(existingRow);
      mockDb.mockReturnValue(chain);

      await service.update('rs-legacy-001', 'user-001', {
        recipe_source: VALID_RECIPE_SOURCE,
      });

      const updateArg = chain.update.mock.calls[0][0] as Record<string, unknown>;
      expect(updateArg['legacy']).toBe(0);
      expect(typeof updateArg['recipe_source']).toBe('string');
      const compiledGraph = JSON.parse(updateArg['compiled_graph'] as string);
      expect(compiledGraph.compiler_version).toBe('1.0.0');
    });
  });

  describe('update() — 非法 recipe_source', () => {
    it('非法 recipe_source → 抛出 RECIPE_VALIDATION_FAILED', async () => {
      const existingRow = { ...LEGACY_ROW, status: 'draft' };
      const chain = makeChain(existingRow);
      mockDb.mockReturnValue(chain);

      await expect(
        service.update('rs-legacy-001', 'user-001', {
          recipe_source: INVALID_RECIPE_SOURCE,
        }),
      ).rejects.toMatchObject({
        code: 'RECIPE_VALIDATION_FAILED',
        errors: expect.arrayContaining([expect.objectContaining({ code: expect.any(String) })]),
      });
    });

    it('非法 recipe_source → DB update 不被调用（在编译阶段即抛出）', async () => {
      const existingRow = { ...LEGACY_ROW, status: 'draft' };
      const chain = makeChain(existingRow);
      mockDb.mockReturnValue(chain);

      try {
        await service.update('rs-legacy-001', 'user-001', {
          recipe_source: INVALID_RECIPE_SOURCE,
        });
      } catch {
        // 预期抛出
      }

      // update 不应被调用
      expect(chain.update).not.toHaveBeenCalled();
    });
  });

  // ── saveVersion() 快照 ────────────────────────────────────────────────────

  describe('saveVersion() — 快照包含 recipe_source 和 compiled_graph', () => {
    it('带 recipe_source 的 ruleset 保存快照时，snapshot 包含 recipe_source 和 compiled_graph', async () => {
      const recipeSource = VALID_RECIPE_SOURCE;
      const compiledGraph = { atoms: {}, connections: {}, compiled_at: '2024-01-01', compiler_version: '1.0.0' };
      const recipeRow = { ...makeRecipeRow(recipeSource, compiledGraph), author_id: 'user-001', status: 'draft' };

      let insertedSnapshot: Record<string, unknown> | null = null;

      // 调用顺序：
      // 1. findById → db('rulesets').where.first → recipeRow
      // 2. count → db('ruleset_versions').where.count.first → { cnt: 0 }
      // 3. insert → db('ruleset_versions').insert → captures snapshot
      // 4. update latest_version_id → db('rulesets').where.update
      const rulesetChain = makeChain(recipeRow);
      const countChain = makeChain({ cnt: 0 });
      const insertChain = makeChain();
      insertChain.insert.mockImplementation((data: Record<string, unknown>) => {
        insertedSnapshot = JSON.parse(data['snapshot'] as string);
        return Promise.resolve([1]);
      });
      const updateChain = makeChain();

      mockDb
        .mockReturnValueOnce(rulesetChain)  // findById
        .mockReturnValueOnce(countChain)     // count
        .mockReturnValueOnce(insertChain)    // insert snapshot
        .mockReturnValueOnce(updateChain);   // update latest_version_id

      // 替换 getVersion 避免第二次 DB 调用
      vi.spyOn(service, 'getVersion').mockResolvedValue({
        id: 'v-001',
        ruleset_id: 'rs-recipe-001',
        version_number: '1.0.0-snapshot.1',
        snapshot: { atoms: {}, connections: {}, commands: {}, character_card_schema: {}, recipe_source: recipeSource, compiled_graph: compiledGraph },
        changelog: '',
        created_at: new Date(),
      });

      await service.saveVersion('rs-recipe-001', '测试快照', 'user-001');

      expect(insertedSnapshot).not.toBeNull();
      expect(insertedSnapshot!['recipe_source']).toEqual(recipeSource);
      expect(insertedSnapshot!['compiled_graph']).toEqual(compiledGraph);
    });

    it('旧格式 ruleset 保存快照时，recipe_source 和 compiled_graph 均为 null', async () => {
      const legacyRulesetRow = { ...LEGACY_ROW, status: 'draft' };

      let insertedSnapshot: Record<string, unknown> | null = null;

      const rulesetChain = makeChain(legacyRulesetRow);
      const countChain = makeChain({ cnt: 0 });
      const insertChain = makeChain();
      insertChain.insert.mockImplementation((data: Record<string, unknown>) => {
        insertedSnapshot = JSON.parse(data['snapshot'] as string);
        return Promise.resolve([1]);
      });
      const updateChain = makeChain();

      mockDb
        .mockReturnValueOnce(rulesetChain)
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(insertChain)
        .mockReturnValueOnce(updateChain);

      vi.spyOn(service, 'getVersion').mockResolvedValue({
        id: 'v-legacy-001',
        ruleset_id: 'rs-legacy-001',
        version_number: '1.0.0-snapshot.1',
        snapshot: { atoms: {}, connections: {}, commands: {}, character_card_schema: {}, recipe_source: null, compiled_graph: null },
        changelog: '',
        created_at: new Date(),
      });

      await service.saveVersion('rs-legacy-001', '旧格式快照', 'user-001');

      expect(insertedSnapshot!['recipe_source']).toBeNull();
      expect(insertedSnapshot!['compiled_graph']).toBeNull();
    });
  });

  // ── rollbackToVersion() ───────────────────────────────────────────────────

  describe('rollbackToVersion() — 恢复 recipe_source', () => {
    it('从含 recipe_source 的快照回滚 → update 含 recipe_source 且 legacy=0', async () => {
      const recipeSource = VALID_RECIPE_SOURCE;
      const compiledGraph = { atoms: {}, connections: {}, compiled_at: '', compiler_version: '1.0.0' };

      const rulesetRow = { ...LEGACY_ROW };
      const versionRow = {
        id: 'v-001',
        ruleset_id: 'rs-legacy-001',
        version_number: '1.0.0-snapshot.1',
        snapshot: JSON.stringify({
          atoms: {},
          connections: [],
          commands: {},
          character_card_schema: {},
          recipe_source: recipeSource,
          compiled_graph: compiledGraph,
        }),
        changelog: '',
        created_at: new Date(),
      };

      const chain = makeChain(rulesetRow);
      // first: 1→ruleset, 2→version
      chain.first
        .mockResolvedValueOnce(rulesetRow)
        .mockResolvedValueOnce(versionRow)
        .mockResolvedValueOnce(rulesetRow); // findById 最后
      mockDb.mockReturnValue(chain);

      await service.rollbackToVersion('rs-legacy-001', 'v-001', 'user-001');

      const updateArg = chain.update.mock.calls[0][0] as Record<string, unknown>;
      const storedSource = JSON.parse(updateArg['recipe_source'] as string);
      expect(storedSource.recipes[0].id).toBe('skill_check');
      expect(updateArg['legacy']).toBe(0);
    });

    it('从无 recipe_source 的快照回滚 → update recipe_source=null，legacy=1', async () => {
      const rulesetRow = { ...LEGACY_ROW };
      const versionRow = {
        id: 'v-legacy-001',
        ruleset_id: 'rs-legacy-001',
        version_number: '1.0.0-snapshot.1',
        snapshot: JSON.stringify({
          atoms: { roll: {} },
          connections: [],
          commands: {},
          character_card_schema: {},
          recipe_source: null,
          compiled_graph: null,
        }),
        changelog: '',
        created_at: new Date(),
      };

      const chain = makeChain(rulesetRow);
      chain.first
        .mockResolvedValueOnce(rulesetRow)
        .mockResolvedValueOnce(versionRow)
        .mockResolvedValueOnce(rulesetRow);
      mockDb.mockReturnValue(chain);

      await service.rollbackToVersion('rs-legacy-001', 'v-legacy-001', 'user-001');

      const updateArg = chain.update.mock.calls[0][0] as Record<string, unknown>;
      expect(updateArg['recipe_source']).toBeNull();
      expect(updateArg['legacy']).toBe(1);
    });
  });

  // ── Legacy 兼容性 ─────────────────────────────────────────────────────────

  describe('legacy 兼容 — 旧格式仍可正常使用', () => {
    it('旧格式 ruleset findById 不报错，返回 atoms 字段', async () => {
      mockDb.mockReturnValue(makeChain(LEGACY_ROW));
      const ruleset = await service.findById('rs-legacy-001');
      expect(ruleset).not.toBeNull();
      expect(ruleset!.atoms).toBeDefined();
    });

    it('旧格式 create（无 recipe_source）不抛出，legacy=1', async () => {
      const chain = makeChain(LEGACY_ROW);
      mockDb.mockReturnValue(chain);

      await expect(
        service.create({ name: '老规则集', version: '1.0.0', author_id: 'user-001' }),
      ).resolves.not.toThrow();

      const insertArg = chain.insert.mock.calls[0][0] as Record<string, unknown>;
      expect(insertArg['legacy']).toBe(1);
      expect(insertArg['recipe_source']).toBeNull();
    });
  });
});
