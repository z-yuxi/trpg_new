import { Router, type IRouter, type NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rulesetService } from '../services/ruleset-service';
import type { ExecuteRequest, RulesetStatus } from '@trpg/shared';
import yaml from 'js-yaml';

const router: IRouter = Router();

// GET /api/rulesets/mine 鈥?褰撳墠鐢ㄦ埛鐨勬墍鏈夎鍒欓泦锛堝惈鑽夌锛岄渶鐧诲綍锛?
// 鈿狅笍 蹇呴』鍦?/:id 涔嬪墠娉ㄥ唽锛屽惁鍒?"mine" 浼氳褰撲綔 id 鍙傛暟鍖归厤
router.get('/mine', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const rulesets = await rulesetService.listMine(req.userId!);
    res.json({ data: rulesets, total: rulesets.length });
  } catch (e) {
    next(e);
  }
});

// GET /api/rulesets 鈥?鍏紑瑙勫垯闆嗗垪琛紙鏃犻渶璁よ瘉锛?
router.get('/', async (req, res, next: NextFunction): Promise<void> => {
  try {
    const status = req.query['status'] as RulesetStatus | undefined;
    const keyword = req.query['keyword'] as string | undefined;
    const author_id = req.query['author_id'] as string | undefined;
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const result = await rulesetService.list({ status, keyword, author_id, page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/rulesets/:id 鈥?瑙勫垯闆嗚鎯咃紙鍚?atoms/connections/commands锛?
router.get('/:id', async (req, res, next: NextFunction): Promise<void> => {
  try {
    const ruleset = await rulesetService.findById(req.params['id']!);
    if (!ruleset) {
      res.status(404).json({ error: 'Ruleset not found' });
      return;
    }
    res.json(ruleset);
  } catch (err) {
    next(err);
  }
});

// POST /api/rulesets 鈥?鍒涘缓瑙勫垯闆嗭紙闇€鐧诲綍锛?
router.post('/', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
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
    next(err);
  }
});

// PUT /api/rulesets/:id 鈥?鏇存柊瑙勫垯闆嗭紙浠呬綔鑰咃級
router.put('/:id', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const ruleset = await rulesetService.update(req.params['id']!, req.userId!, req.body);
    res.json(ruleset);
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/publish 鈥?鍙戝竷瑙勫垯闆嗭紙draft 鈫?published锛?
router.post('/:id/publish', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const ruleset = await rulesetService.publish(req.params['id']!, req.userId!);
    res.json(ruleset);
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/execute 鈥?鎵ц瑙勫垯鍛戒护
router.post('/:id/execute', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as ExecuteRequest;
    if (!body.command || typeof body.command !== 'string') {
      res.status(400).json({ error: 'command is required' });
      return;
    }
    // context 鍜?mock_context 浜岄€変竴锛屼袱鑰呴兘缂烘椂杩斿洖 400
    if (!body.mock_context && (!body.context?.character_id || !body.context?.campaign_id)) {
      res.status(400).json({
        error: 'Either mock_context or context (with character_id and campaign_id) is required',
      });
      return;
    }
    const result = await rulesetService.executeCommand(req.params['id']!, body);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// 鈹€鈹€ 鐗堟湰鎺у埗绔偣 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// GET /api/rulesets/:id/versions 鈥?鐗堟湰鍘嗗彶
router.get('/:id/versions', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const versions = await rulesetService.listVersions(req.params['id']!);
    res.json({ data: versions, total: versions.length });
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/versions 鈥?鎵嬪姩淇濆瓨鐗堟湰蹇収
router.post('/:id/versions', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const { changelog } = req.body as { changelog?: string };
    const version = await rulesetService.saveVersion(req.params['id']!, changelog ?? '', req.userId!);
    res.status(201).json(version);
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/versions/:vid/rollback 鈥?鍥炴粴鍒版寚瀹氱増鏈?
router.post('/:id/versions/:vid/rollback', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const ruleset = await rulesetService.rollbackToVersion(req.params['id']!, req.params['vid']!, req.userId!);
    res.json(ruleset);
  } catch (e) {
    next(e);
  }
});

// GET /api/rulesets/:id/versions/compare?a=vid1&b=vid2 鈥?瀵规瘮鐗堟湰
router.get('/:id/versions/compare', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const a = req.query['a'] as string;
    const b = req.query['b'] as string;
    if (!a || !b) { res.status(400).json({ error: 'a and b version IDs are required' }); return; }
    const diff = await rulesetService.compareVersions(a, b);
    res.json(diff);
  } catch (e) {
    next(e);
  }
});

// 鈹€鈹€ 鍙戝竷鐘舵€佹満绔偣 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

// POST /api/rulesets/:id/submit-review 鈥?draft 鈫?published锛圴1.0 鑷姩瀹℃牳锛?
router.post('/:id/submit-review', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const ruleset = await rulesetService.submitForReview(req.params['id']!, req.userId!);
    res.json(ruleset);
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/deprecate 鈥?published 鈫?deprecated
router.post('/:id/deprecate', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const ruleset = await rulesetService.deprecate(req.params['id']!, req.userId!);
    res.json(ruleset);
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/fork 鈥?Fork 瑙勫垯闆?
router.post('/:id/fork', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const result = await rulesetService.forkRuleset(req.params['id']!, req.userId!);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/merge-from-parent 鈥?浠庝笂娓?parent 鍚堝苟鍙樻洿
router.post('/:id/merge-from-parent', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const result = await rulesetService.mergeFromParent(req.params['id']!, req.userId!);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/:id/resolve-merge 鈥?瑙ｅ喅鍚堝苟鍐茬獊锛堢敤鎴烽€夋嫨姣忎釜鍐茬獊鑺傜偣淇濈暀鍝柟锛?
router.post('/:id/resolve-merge', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const { resolutions } = req.body as {
      resolutions?: Array<{ node_id: string; keep: 'ours' | 'theirs' }>;
    };
    if (!Array.isArray(resolutions)) {
      res.status(400).json({ error: 'resolutions array is required' });
      return;
    }
    const ruleset = await rulesetService.resolveMerge(req.params['id']!, req.userId!, resolutions);
    res.json(ruleset);
  } catch (e) {
    next(e);
  }
});

// GET /api/rulesets/:id/export?format=yaml 鈥?瀵煎嚭瑙勫垯闆嗕负 YAML
router.get('/:id/export', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
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
  } catch (e) {
    next(e);
  }
});

// POST /api/rulesets/import 鈥?浠?YAML 瀵煎叆瑙勫垯闆嗭紙鍒涘缓鏂拌鍒欓泦锛?
router.post('/import', authMiddleware, async (req, res, next: NextFunction): Promise<void> => {
  try {
    const { yaml: yamlStr } = req.body as { yaml?: string };
    if (!yamlStr || typeof yamlStr !== 'string') {
      res.status(400).json({ error: 'yaml field is required' });
      return;
    }
    const parsed = yaml.load(yamlStr) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      res.status(400).json({ error: 'Invalid YAML: expected an object' });
      return;
    }
    // 鍒涘缓鏂拌鍒欓泦锛屾竻闄?ID 鍜?author_id锛堢敱鏈嶅姟绔噸鏂板垎閰嶏級
    delete parsed['id'];
    delete parsed['author_id'];
    delete parsed['created_at'];
    delete parsed['updated_at'];
    if (typeof parsed['name'] === 'string') {
      parsed['name'] = `[瀵煎叆] ${parsed['name']}`;
    }
    const ruleset = await rulesetService.create({
      ...(parsed as any),
      author_id: req.userId!,
      status: 'draft',
    });
    res.status(201).json({ id: ruleset.id, name: ruleset.name });
  } catch (e) {
    next(e);
  }
});

export default router;

