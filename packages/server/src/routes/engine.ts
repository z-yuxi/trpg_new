import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { rulesetService } from '../services/ruleset-service';
import type { ExecuteRequest } from '@trpg/shared';

const router: IRouter = Router();

/**
 * POST /api/v1/engine/execute
 *
 * 执行规则检定。调用方提供 ruleset_id + command（骰子公式或 /cmd 格式）
 * 以及可选的角色上下文 / mock 数据，引擎返回执行结果与骰子明细。
 *
 * 对应 API 合约：docs/api-contracts/engine-execute.yaml
 */
router.post('/execute', authMiddleware, async (req, res): Promise<void> => {
  const body = req.body as ExecuteRequest & { ruleset_id?: string };

  const ruleset_id = body.ruleset_id;
  if (!ruleset_id || typeof ruleset_id !== 'string') {
    res.status(400).json({ error: 'ruleset_id is required', error_code: 'RECIPE_NOT_FOUND' });
    return;
  }

  const command = body.command;
  if (!command || typeof command !== 'string') {
    res.status(400).json({ error: 'command is required', error_code: 'DSL_EVAL_ERROR' });
    return;
  }

  try {
    const result = await rulesetService.executeCommand(ruleset_id, body);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };

    if (e.code === 'NOT_FOUND') {
      res.status(400).json({ error: e.message ?? 'Not found', error_code: 'RECIPE_NOT_FOUND' });
      return;
    }

    // DSL 语义错误
    if (e.message?.includes('Command') || e.message?.includes('parse') || e.message?.includes('DSL')) {
      res.status(422).json({ error: e.message ?? 'DSL error', error_code: 'DSL_EVAL_ERROR' });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
