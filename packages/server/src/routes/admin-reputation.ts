/**
 * admin-reputation.ts
 * 运营后台：信誉分审计查询 + 互评申诉管理
 *
 * 挂载路径（index.ts）：router.use('/admin', adminReputationRoutes)
 *
 * 所有路由要求：
 *  - 已登录（authMiddleware）
 *  - user_type 包含 'admin'（requireAdmin 中间件）
 *
 * 例外：POST /admin/reviews/:reviewId/appeal 允许普通已登录用户提交申诉
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { db } from '../db';
import { reputationAuditService } from '../services/reputation-audit-service';

const router = Router();

// ─── Admin 权限守卫（user_type 包含 'admin'） ─────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const isAdmin = Array.isArray(user.user_type) && user.user_type.includes('admin');
  if (!isAdmin) {
    res.status(403).json({ error: 'Admin permission required' });
    return;
  }
  next();
}

// ─── GET /admin/reputation/audit-log ────────────────────────────────────────
// 查询信誉分变动日志（支持多维度筛选 + 分页）

router.get(
  '/reputation/audit-log',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        user_id, reviewer_id, campaign_id,
        anti_cheat_flag, from_date, to_date,
        limit = '20', offset = '0',
      } = req.query as Record<string, string>;

      const result = await reputationAuditService.listAuditLog({
        user_id:        user_id        || undefined,
        reviewer_id:    reviewer_id    || undefined,
        campaign_id:    campaign_id    || undefined,
        anti_cheat_flag: anti_cheat_flag as any || undefined,
        from_date:      from_date ? new Date(from_date) : undefined,
        to_date:        to_date   ? new Date(to_date)   : undefined,
        limit:  Math.min(100, parseInt(limit,  10) || 20),
        offset: Math.max(0,   parseInt(offset, 10) || 0),
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── GET /admin/reputation/suspicious ───────────────────────────────────────
// 快捷查询所有被反作弊标记的条目

router.get(
  '/reputation/suspicious',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { limit = '50', offset = '0' } = req.query as Record<string, string>;
      const result = await reputationAuditService.listSuspicious(
        Math.min(100, parseInt(limit, 10) || 50),
        Math.max(0,   parseInt(offset, 10) || 0),
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── POST /admin/reviews/:reviewId/appeal ────────────────────────────────────
// 普通已登录用户提交申诉（非 admin 专属，但需要登录）

router.post(
  '/reviews/:reviewId/appeal',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const { reviewId } = req.params;
    const { reason } = req.body as { reason?: string };
    const appellantId = req.userId!;

    if (!reason || reason.trim().length === 0) {
      res.status(400).json({ error: '申诉理由不能为空' });
      return;
    }

    try {
      const appeal = await reputationAuditService.submitAppeal({
        review_id:    reviewId,
        appellant_id: appellantId,
        reason,
      });
      res.status(201).json(appeal);
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.message === 'APPEAL_ALREADY_EXISTS') {
        res.status(409).json({ error: '已提交过申诉，请等待处理' });
        return;
      }
      if (e.status && e.status < 500) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── GET /admin/reviews/appeals ──────────────────────────────────────────────
// 运营查询申诉列表

router.get(
  '/reviews/appeals',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        status, appellant_id,
        limit = '20', offset = '0',
      } = req.query as Record<string, string>;

      const result = await reputationAuditService.listAppeals({
        status:       status as any || undefined,
        appellant_id: appellant_id || undefined,
        limit:  Math.min(100, parseInt(limit,  10) || 20),
        offset: Math.max(0,   parseInt(offset, 10) || 0),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── POST /admin/reviews/appeals/:appealId/resolve ───────────────────────────
// 运营处理申诉（resolved_remove 或 resolved_keep）

router.post(
  '/reviews/appeals/:appealId/resolve',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { appealId } = req.params;
    const { decision, resolution_note } = req.body as {
      decision?: string;
      resolution_note?: string;
    };

    if (!decision || !['resolved_remove', 'resolved_keep'].includes(decision)) {
      res.status(400).json({ error: 'decision 必须是 resolved_remove 或 resolved_keep' });
      return;
    }

    try {
      const appeal = await reputationAuditService.resolveAppeal({
        appeal_id:       appealId,
        admin_user_id:   req.userId!,
        decision:        decision as 'resolved_remove' | 'resolved_keep',
        resolution_note: resolution_note,
      });
      res.json(appeal);
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.message === 'APPEAL_NOT_FOUND_OR_ALREADY_RESOLVED') {
        res.status(404).json({ error: '申诉不存在或已处理' });
        return;
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;

// ── 内容审核路由（模组 & 规则包）已在此路由器中注册，挂载路径 /admin ──

/**
 * POST /admin/content/modules/:id/approve
 * 强制审核通过（reviewing / public_notice → public）
 */
router.post(
  '/content/modules/:id/approve',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const row = await db('modules').where({ id }).first();
      if (!row) { res.status(404).json({ error: 'Module not found' }); return; }
      if (!['reviewing', 'public_notice'].includes(row.status)) {
        res.status(400).json({ error: `Cannot approve module in status: ${row.status}` });
        return;
      }
      await db('modules').where({ id }).update({ status: 'public', updated_at: new Date() });
      res.json({ id, status: 'public' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Approve failed' });
    }
  }
);

/**
 * POST /admin/content/modules/:id/suspend
 * 暂停上架（published / public_notice → suspended）
 */
const suspendSchema = z.object({ reason: z.string().min(1).max(500) });

router.post(
  '/content/modules/:id/suspend',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = suspendSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'reason is required' }); return; }
    const { id } = req.params;
    try {
      const row = await db('modules').where({ id }).first();
      if (!row) { res.status(404).json({ error: 'Module not found' }); return; }
      if (!['public', 'public_notice', 'reviewing'].includes(row.status)) {
        res.status(400).json({ error: `Cannot suspend module in status: ${row.status}` }); return;
      }
      await db('modules').where({ id }).update({
        status: 'suspended',
        suspended_reason: parsed.data.reason,
        updated_at: new Date(),
      });
      res.json({ id, status: 'suspended', suspended_reason: parsed.data.reason });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Suspend failed' });
    }
  }
);

/**
 * POST /admin/content/rulesets/:id/approve
 */
router.post(
  '/content/rulesets/:id/approve',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const row = await db('rulesets').where({ id }).first();
      if (!row) { res.status(404).json({ error: 'Ruleset not found' }); return; }
      await db('rulesets').where({ id }).update({ status: 'published', updated_at: new Date() });
      res.json({ id, status: 'published' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Approve failed' });
    }
  }
);

/**
 * POST /admin/content/rulesets/:id/suspend
 */
router.post(
  '/content/rulesets/:id/suspend',
  authMiddleware,
  requireAdmin,
  async (req: Request, res: Response) => {
    const parsed = suspendSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'reason is required' }); return; }
    const { id } = req.params;
    try {
      const row = await db('rulesets').where({ id }).first();
      if (!row) { res.status(404).json({ error: 'Ruleset not found' }); return; }
      await db('rulesets').where({ id }).update({
        status: 'deprecated',
        updated_at: new Date(),
      });
      res.json({ id, status: 'deprecated', reason: parsed.data.reason });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? 'Suspend failed' });
    }
  }
);
