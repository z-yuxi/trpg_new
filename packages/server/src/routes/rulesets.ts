import { Router, type IRouter } from 'express';
import { authMiddleware, optionalAuthMiddleware, requireCreator } from '../middleware/auth';
import { rulesetService } from '../services/ruleset-service';
import type { ExecuteRequest, RulesetStatus } from '@trpg/shared';
import yaml from 'js-yaml';

const router: IRouter = Router();

// GET /api/rulesets/mine — 当前用户的所有规则集（含草稿，需登录）
// ⚠️ 必须在 /:id 之前注册，否则 "mine" 会被当作 id 参数匹配
router.get('/mine', authMiddleware, async (req, res): Promise<void> => {
  try {
    const rulesets = await rulesetService.listMine(req.userId!);
    res.json({ data: rulesets, total: rulesets.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rulesets — 公开规则集列表（无需认证）
router.get('/', async (req, res): Promise<void> => {
  try {
    const status = req.query['status'] as RulesetStatus | undefined;
    const keyword = req.query['keyword'] as string | undefined;
    const author_id = req.query['author_id'] as string | undefined;
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const result = await rulesetService.list({ status, keyword, author_id, page, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rulesets/:id — 规则集详情（含 atoms/connections/commands）
router.get('/:id', optionalAuthMiddleware, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.findById(req.params['id']!);
    if (!ruleset) {
      res.status(404).json({ error: 'Ruleset not found' });
      return;
    }
    // 非 published 状态需认证且为作者
    if (ruleset.status !== 'published') {
      if (!req.user || req.user.id !== ruleset.author_id) {
        res.status(404).json({ error: 'Ruleset not found' });
        return;
      }
    }
    // 规则包当前无付费购买体系，已登录用户 or 免费发布均视为已获取
    const is_owned = ruleset.status === 'published'
      ? true
      : (req.user?.id === ruleset.author_id);
    res.json({ ...ruleset, is_owned });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets — 创建规则集（需创作者权限）
router.post('/', authMiddleware, requireCreator, async (req, res): Promise<void> => {
  try {
    const { name, version, description, parent_ruleset_id, character_card_schema, recipe_source } = req.body as {
      name?: string;
      version?: string;
      description?: string;
      parent_ruleset_id?: string;
      character_card_schema?: object;
      recipe_source?: import('@trpg/shared').RulesetRecipeSource;
    };
    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const ruleset = await rulesetService.create({
      name: name.trim(),
      version: (version ?? '1.0.0').trim(),
      description: description?.trim(),
      author_id: req.userId!,
      parent_ruleset_id,
      character_card_schema,
      recipe_source,
    });
    res.status(201).json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; errors?: unknown[] };
    if (e.code === 'RECIPE_VALIDATION_FAILED') {
      res.status(400).json({ error: e.message, validation_errors: e.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rulesets/:id — 更新规则集（仅创作者作者）
router.put('/:id', authMiddleware, requireCreator, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.update(req.params['id']!, req.userId!, req.body);
    res.json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; errors?: unknown[] };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    if (e.code === 'RECIPE_VALIDATION_FAILED') {
      res.status(400).json({ error: e.message, validation_errors: e.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/publish — 发布规则集（draft → published，需创作者权限）
router.post('/:id/publish', authMiddleware, requireCreator, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.publish(req.params['id']!, req.userId!);
    res.json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/execute — 执行规则命令
router.post('/:id/execute', authMiddleware, async (req, res): Promise<void> => {
  try {
    const body = req.body as ExecuteRequest;
    if (!body.command || typeof body.command !== 'string') {
      res.status(400).json({ error: 'command is required' });
      return;
    }
    // context 和 mock_context 二选一，两者都缺时返回 400
    if (!body.mock_context && (!body.context?.character_id || !body.context?.campaign_id)) {
      res.status(400).json({
        error: 'Either mock_context or context (with character_id and campaign_id) is required',
      });
      return;
    }
    const result = await rulesetService.executeCommand(req.params['id']!, body);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 版本控制端点 ──────────────────────────────────────────────────────────

// GET /api/rulesets/:id/versions — 版本历史
router.get('/:id/versions', authMiddleware, async (req, res): Promise<void> => {
  try {
    const versions = await rulesetService.listVersions(req.params['id']!);
    res.json({ data: versions, total: versions.length });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/versions — 手动保存版本快照（需创作者权限）
router.post('/:id/versions', authMiddleware, requireCreator, async (req, res): Promise<void> => {
  try {
    const { changelog } = req.body as { changelog?: string };
    const version = await rulesetService.saveVersion(req.params['id']!, changelog ?? '', req.userId!);
    res.status(201).json(version);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/versions/:vid/rollback — 回滚到指定版本（需创作者权限）
router.post('/:id/versions/:vid/rollback', authMiddleware, requireCreator, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.rollbackToVersion(req.params['id']!, req.params['vid']!, req.userId!);
    res.json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rulesets/:id/versions/compare?a=vid1&b=vid2 — 对比版本
router.get('/:id/versions/compare', authMiddleware, async (req, res): Promise<void> => {
  try {
    const a = req.query['a'] as string;
    const b = req.query['b'] as string;
    if (!a || !b) { res.status(400).json({ error: 'a and b version IDs are required' }); return; }
    const diff = await rulesetService.compareVersions(a, b);
    res.json(diff);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── 发布状态机端点 ────────────────────────────────────────────────────────

// POST /api/rulesets/:id/submit-review — draft → published（V1.0 自动审核）
router.post('/:id/submit-review', authMiddleware, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.submitForReview(req.params['id']!, req.userId!);
    res.json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/deprecate — published → deprecated
router.post('/:id/deprecate', authMiddleware, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.deprecate(req.params['id']!, req.userId!);
    res.json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/fork — Fork 规则集
router.post('/:id/fork', authMiddleware, async (req, res): Promise<void> => {
  try {
    const result = await rulesetService.forkRuleset(req.params['id']!, req.userId!);
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/merge-from-parent — 从上游 parent 合并变更
router.post('/:id/merge-from-parent', authMiddleware, async (req, res): Promise<void> => {
  try {
    const result = await rulesetService.mergeFromParent(req.params['id']!, req.userId!);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rulesets/:id/export?format=yaml — 导出规则集为 YAML
router.get('/:id/export', authMiddleware, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.findById(req.params['id']!);
    const format = (req.query['format'] as string) ?? 'json';
    if (format === 'yaml') {
      const yamlStr = yaml.dump(ruleset, { indent: 2, lineWidth: 120, noRefs: true });
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ruleset-${req.params['id']}.yaml"`);
      res.send(yamlStr);
    } else {
      res.json(ruleset);
    }
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/import — 从 YAML 导入规则集（创建新规则集）
router.post('/import', authMiddleware, async (req, res): Promise<void> => {
  try {
    const { yaml: yamlStr } = req.body as { yaml?: string };
    if (!yamlStr || typeof yamlStr !== 'string') {
      res.status(400).json({ error: 'yaml field is required' });
      return;
    }
    if (Buffer.byteLength(yamlStr, 'utf8') > 512 * 1024) {
      res.status(413).json({ error: 'YAML content too large (max 512 KB)' });
      return;
    }
    const parsed = yaml.load(yamlStr) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      res.status(400).json({ error: 'Invalid YAML: expected an object' });
      return;
    }
    // 创建新规则集，清除 ID 和 author_id（由服务端重新分配）
    delete parsed['id'];
    delete parsed['author_id'];
    delete parsed['created_at'];
    delete parsed['updated_at'];
    if (typeof parsed['name'] === 'string') {
      parsed['name'] = `[导入] ${parsed['name']}`;
    }
    const ruleset = await rulesetService.create({
      ...(parsed as any),
      author_id: req.userId!,
      status: 'draft',
    });
    res.status(201).json({ id: ruleset.id, name: ruleset.name });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/test-recipe — 单 recipe 测试运行（编辑器实时预览，仅作者）
router.post('/:id/test-recipe', authMiddleware, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.findById(req.params['id']!);
    if (!ruleset) { res.status(404).json({ error: 'Ruleset not found' }); return; }
    if (ruleset.author_id !== req.userId) { res.status(403).json({ error: 'Forbidden' }); return; }

    const { recipe, test_inputs, mock_context } = req.body as {
      recipe?: import('@trpg/shared').Recipe;
      test_inputs?: Record<string, unknown>;
      mock_context?: {
        attributes: Record<string, number>;
        skills: Record<string, number>;
        resources: Record<string, { current: number; max: number }>;
      };
    };
    if (!recipe) { res.status(400).json({ error: 'recipe is required' }); return; }

    const allRecipes = ruleset.recipe_source?.recipes ?? [];
    const result = await rulesetService.testRecipe({ recipe, allRecipes, test_inputs, mock_context });
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/migrate-to-recipe — 将旧格式迁移为 Recipe（仅作者，不可逆）
router.post('/:id/migrate-to-recipe', authMiddleware, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.migrateToRecipe(req.params['id']!, req.userId!);
    res.json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; errors?: unknown[] };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    if (e.code === 'RECIPE_VALIDATION_FAILED') {
      res.status(400).json({ error: e.message, validation_errors: e.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
