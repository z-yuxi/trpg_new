import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rulesetService } from '../services/ruleset-service';
import type { RulesetStatus } from '@trpg/shared';

const router: IRouter = Router();

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
router.get('/:id', async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.findById(req.params['id']!);
    if (!ruleset) {
      res.status(404).json({ error: 'Ruleset not found' });
      return;
    }
    res.json(ruleset);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets — 创建规则集（需登录）
router.post('/', authMiddleware, async (req, res): Promise<void> => {
  try {
    const { name, version, description, parent_ruleset_id, character_card_schema } = req.body as {
      name?: string;
      version?: string;
      description?: string;
      parent_ruleset_id?: string;
      character_card_schema?: object;
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
    });
    res.status(201).json(ruleset);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/rulesets/:id — 更新规则集（仅作者）
router.put('/:id', authMiddleware, async (req, res): Promise<void> => {
  try {
    const ruleset = await rulesetService.update(req.params['id']!, req.userId!, req.body);
    res.json(ruleset);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    if (e.code === 'FORBIDDEN') { res.status(403).json({ error: e.message }); return; }
    if (e.code === 'BAD_REQUEST') { res.status(400).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rulesets/:id/publish — 发布规则集（draft → published）
router.post('/:id/publish', authMiddleware, async (req, res): Promise<void> => {
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
    const { command, params, context } = req.body as {
      command?: string;
      params?: Record<string, unknown>;
      context?: { character_id: string; campaign_id: string; scene_id?: string };
    };
    if (!command || typeof command !== 'string') {
      res.status(400).json({ error: 'command is required' });
      return;
    }
    if (!context?.character_id || !context?.campaign_id) {
      res.status(400).json({ error: 'context.character_id and context.campaign_id are required' });
      return;
    }
    const result = await rulesetService.executeCommand({
      ruleset_id: req.params['id']!,
      command,
      params: params ?? {},
      context,
    });
    res.json(result);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: e.message }); return; }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
