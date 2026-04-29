/**
 * 会员与支付路由
 *
 * GET  /api/membership/benefits      — 查询当前用户有效档位和所有权益
 * POST /api/membership/grant         — 运营手工授予会员（需 admin）
 * GET  /api/membership/events        — 查询当前用户订阅事件历史
 */
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { membershipService } from '../services/membership-service';
import { db } from '../db';
import { MEMBERSHIP_BENEFITS } from '@trpg/shared';

const router: IRouter = Router();

// GET /api/membership/benefits — 返回当前有效档位和权益列表
router.get('/benefits', authMiddleware, async (req, res) => {
  try {
    const tier = await membershipService.getEffectiveTier(req.user!.id);
    const benefits = MEMBERSHIP_BENEFITS[tier];
    res.json({
      tier,
      benefits,
      expires_at: req.user!.subscription_expires_at ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to get membership info' });
  }
});

// GET /api/membership/events — 当前用户订阅变更历史（最近 50 条）
router.get('/events', authMiddleware, async (req, res) => {
  try {
    const rows = await db('subscription_events')
      .where({ user_id: req.user!.id })
      .orderBy('created_at', 'desc')
      .limit(50);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Failed to get events' });
  }
});

const grantSchema = z.object({
  target_user_id: z.string().min(1),
  tier: z.enum(['pro', 'creator']),
  /** ISO 日期字符串，如 "2027-04-29T00:00:00Z" */
  expires_at: z.string().datetime(),
});

// POST /api/membership/grant — admin 手工授予会员（仅管理员）
router.post('/grant', authMiddleware, async (req, res) => {
  const user = req.user!;
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    await membershipService.grant({
      targetUserId: parsed.data.target_user_id,
      tier: parsed.data.tier,
      expiresAt: new Date(parsed.data.expires_at),
      operatorId: user.id,
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Grant failed' });
  }
});

export default router;
