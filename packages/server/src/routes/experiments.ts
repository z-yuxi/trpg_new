/**
 * A/B 实验平台路由
 *
 * GET  /api/experiments/assignments       — 获取当前用户所有 running 实验分配（前端初始化）
 * POST /api/experiments/track             — 追踪曝光/转化事件
 * GET  /api/experiments/:name/stats       — 查看实验结果（需 admin）
 * POST /api/experiments                   — 创建实验（需 admin）
 * PUT  /api/experiments/:name/status      — 更新实验状态（需 admin）
 */
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { experimentService } from '../services/experiment-service';
import { safeErrorMessage } from '../utils/error-response';

const router: IRouter = Router();

// GET /api/experiments/assignments — 前端初始化时获取全部分配
router.get('/assignments', optionalAuthMiddleware, async (req, res) => {
  if (!req.user) {
    res.json({});
    return;
  }
  try {
    const assignments = await experimentService.getAllAssignments(req.user.id);
    res.json(assignments);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Failed to get assignments') });
  }
});

const trackSchema = z.object({
  experiment_name: z.string().min(1),
  event_type: z.enum(['expose', 'convert', 'custom']),
  event_name: z.string().max(128).optional(),
  properties: z.record(z.unknown()).optional(),
});

// POST /api/experiments/track — 追踪事件（需登录）
router.post('/track', authMiddleware, async (req, res) => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  await experimentService.track({
    experimentName: parsed.data.experiment_name,
    userId: getAuthedUser(req).id,
    eventType: parsed.data.event_type,
    eventName: parsed.data.event_name,
    properties: parsed.data.properties,
  });
  res.json({ ok: true });
});

// GET /api/experiments/:name/stats — 实验统计（需 admin）
router.get('/:name/stats', authMiddleware, async (req, res) => {
  const user = getAuthedUser(req);
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

  try {
    const stats = await experimentService.getStats(req.params.name!);
    if (!stats) { res.status(404).json({ error: 'Experiment not found' }); return; }
    res.json(stats);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Failed to get stats') });
  }
});

const createSchema = z.object({
  name: z.string().min(1).max(128).regex(/^[a-z0-9_]+$/, 'name must be snake_case'),
  description: z.string().max(500).optional(),
  variants: z.array(z.object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(128),
    weight: z.number().int().min(1),
  })).min(2, 'At least 2 variants required'),
  goal_event: z.string().max(128).optional(),
  traffic_percent: z.number().int().min(1).max(100).optional(),
});

// POST /api/experiments — 创建实验（需 admin）
router.post('/', authMiddleware, async (req, res) => {
  const user = getAuthedUser(req);
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const exp = await experimentService.create({
      name: parsed.data.name,
      description: parsed.data.description,
      variants: parsed.data.variants,
      goalEvent: parsed.data.goal_event,
      trafficPercent: parsed.data.traffic_percent,
      createdBy: user.id,
    });
    res.status(201).json(exp);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Failed to create experiment') });
  }
});

const statusSchema = z.object({
  status: z.enum(['draft', 'running', 'paused', 'concluded']),
});

// PUT /api/experiments/:name/status — 更新实验状态（需 admin）
router.put('/:name/status', authMiddleware, async (req, res) => {
  const user = getAuthedUser(req);
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) { res.status(403).json({ error: 'Admin only' }); return; }

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    await experimentService.updateStatus(req.params.name!, parsed.data.status);
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Failed to update status') });
  }
});

export default router;
