import { Router, type IRouter } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { reviewService } from '../services/review-service';

// ── 限流：防止评价刷量 ──────────────────────────────────────────────────────
const reviewCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试' },
});

// ── 校验 Schema ───────────────────────────────────────────────────────────────

const createReviewSchema = z.object({
  reviewee_id: z.string().min(1),
  reviewer_role: z.enum(['gm', 'player']),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).nullable().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

/**
 * POST /api/campaigns/:campaignId/reviews
 * 提交对某位成员的评价（房间结束后 14 天内有效）
 */
router.post(
  '/campaigns/:campaignId/reviews',
  authMiddleware,
  reviewCreateLimiter,
  async (req, res) => {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: '参数错误', details: parsed.error.issues });
    }

    const reviewer_id = (req as { user?: { id: string } }).user?.id;
    if (!reviewer_id) return res.status(401).json({ error: '未登录' });

    try {
      const review = await reviewService.createReview({
        campaign_id: req.params.campaignId,
        reviewer_id,
        reviewee_id: parsed.data.reviewee_id,
        reviewer_role: parsed.data.reviewer_role,
        rating: parsed.data.rating,
        comment: parsed.data.comment ?? null,
      });
      return res.status(201).json(review);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'UNKNOWN';
      const statusMap: Record<string, number> = {
        CAMPAIGN_NOT_FOUND: 404,
        CAMPAIGN_NOT_ENDED: 409,
        REVIEW_WINDOW_EXPIRED: 409,
        REVIEW_ALREADY_EXISTS: 409,
        USER_NOT_CAMPAIGN_MEMBER: 403,
        SELF_REVIEW_NOT_ALLOWED: 400,
        ROLE_MISMATCH: 400,
        INVALID_RATING: 400,
      };
      return res.status(statusMap[msg] ?? 500).json({ error: msg });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/reviews
 * 获取某房间的评价列表（可选登录）
 */
router.get(
  '/campaigns/:campaignId/reviews',
  optionalAuthMiddleware,
  async (req, res) => {
    try {
      const reviews = await reviewService.listCampaignReviews(req.params.campaignId);
      return res.json({ data: reviews });
    } catch {
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

/**
 * GET /api/campaigns/:campaignId/reviews/my-status
 * 获取当前用户在该房间的评价提交状态
 */
router.get(
  '/campaigns/:campaignId/reviews/my-status',
  authMiddleware,
  async (req, res) => {
    const reviewer_id = (req as { user?: { id: string } }).user?.id;
    if (!reviewer_id) return res.status(401).json({ error: '未登录' });

    try {
      const reviews = await reviewService.listCampaignReviews(req.params.campaignId);
      const submitted = reviews
        .filter((r) => r.reviewer_id === reviewer_id)
        .map((r) => r.reviewee_id);
      return res.json({ submitted_for: submitted });
    } catch {
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

/**
 * GET /api/users/:userId/reputation
 * 获取用户信誉汇总（公开）
 */
router.get(
  '/users/:userId/reputation',
  optionalAuthMiddleware,
  async (req, res) => {
    try {
      const reputation = await reviewService.getReputation(req.params.userId);
      return res.json(reputation);
    } catch {
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

/**
 * GET /api/users/:userId/reviews
 * 获取用户收到的评价列表
 */
router.get(
  '/users/:userId/reviews',
  optionalAuthMiddleware,
  async (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '20'), 10) || 20, 50);
    const offset = parseInt(String(req.query.offset ?? '0'), 10) || 0;

    try {
      const reviews = await reviewService.listUserReviews(req.params.userId, limit, offset);
      return res.json({ data: reviews, limit, offset });
    } catch {
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

export default router;
