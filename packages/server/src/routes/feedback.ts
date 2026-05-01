/**
 * 跑团反馈（Stars and Wishes）路由
 * 设计依据：附录 C § 5.13 / 附录 B § 4.1
 */
import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { feedbackService } from '../services/feedback-service';
import { db } from '../db';

const router: IRouter = Router();

// ── 校验 Schema ───────────────────────────────────────────────────────────────

const upsertSchema = z.object({
  star: z.string().max(500).nullable().optional(),
  wish: z.string().max(500).nullable().optional(),
});

const visibilitySchema = z.object({
  visibility: z.enum(['gm_only', 'all_members']),
});

// ── 辅助：确认 GM 身份 ─────────────────────────────────────────────────────────

async function ensureGm(campaignId: string, userId: string): Promise<boolean> {
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  return !!campaign && (campaign as Record<string, unknown>)['gm_user_id'] === userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// 路由
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/campaigns/:campaignId/feedback
 * 提交或更新当前用户的反馈（upsert）
 */
router.post('/campaigns/:campaignId/feedback', authMiddleware, async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: '参数错误', details: parsed.error.issues });
  }
  const userId = req.user!.id;
  try {
    const feedback = await feedbackService.upsertFeedback(
      req.params.campaignId,
      userId,
      parsed.data,
    );
    return res.status(200).json(feedback);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    const statusMap: Record<string, number> = {
      CAMPAIGN_NOT_FOUND: 404,
      NOT_A_MEMBER: 403,
    };
    return res.status(statusMap[msg] ?? 500).json({ error: msg });
  }
});

/**
 * GET /api/campaigns/:campaignId/feedback/me
 * 获取当前用户自己的反馈
 */
router.get('/campaigns/:campaignId/feedback/me', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  try {
    const feedback = await feedbackService.getMyFeedback(req.params.campaignId, userId);
    return res.json({ data: feedback });
  } catch {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * GET /api/campaigns/:campaignId/feedback
 * GM 获取全量反馈列表 + 未提交名单
 */
router.get('/campaigns/:campaignId/feedback', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  const isGm = await ensureGm(req.params.campaignId, userId);
  if (!isGm) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  try {
    const summary = await feedbackService.getFeedbackSummary(req.params.campaignId);
    return res.json(summary);
  } catch {
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * DELETE /api/campaigns/:campaignId/feedback
 * 软删除当前用户的反馈
 */
router.delete('/campaigns/:campaignId/feedback', authMiddleware, async (req, res) => {
  const userId = req.user!.id;
  try {
    await feedbackService.deleteFeedback(req.params.campaignId, userId);
    return res.status(204).send();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'FEEDBACK_NOT_FOUND') return res.status(404).json({ error: msg });
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * PATCH /api/campaigns/:campaignId/feedback/visibility
 * GM 切换该团所有反馈的可见范围
 */
router.patch('/campaigns/:campaignId/feedback/visibility', authMiddleware, async (req, res) => {
  const parsed = visibilitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: '参数错误', details: parsed.error.issues });
  }
  const userId = req.user!.id;
  try {
    await feedbackService.updateVisibility(
      req.params.campaignId,
      userId,
      parsed.data.visibility,
    );
    return res.status(200).json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    const statusMap: Record<string, number> = { CAMPAIGN_NOT_FOUND: 404, FORBIDDEN: 403 };
    return res.status(statusMap[msg] ?? 500).json({ error: msg });
  }
});

export default router;
