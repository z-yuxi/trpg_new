/**
 * creator-earnings.ts
 * 创作者收益 API
 *
 * 挂载路径（index.ts）：router.use('/creator', creatorEarningsRoutes)
 *
 * 端点列表：
 *   GET  /creator/earnings/summary              — 收益汇总（可用余额/历史收入）
 *   GET  /creator/earnings/sales                — 销售明细列表
 *   POST /creator/earnings/withdrawals          — 提交提现申请
 *   GET  /creator/earnings/withdrawals          — 提现申请列表
 *   POST /creator/modules/:id/objections        — 提交公示期异议（任意登录用户）
 *   POST /creator/modules/:id/appeal            — 提交作者申诉
 */
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireCreator } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { creatorEarningsService } from '../services/creator-earnings-service';

const router = Router();

// ─── 收益汇总 ──────────────────────────────────────────────────────────────

router.get('/earnings/summary', authMiddleware, requireCreator, async (req, res) => {
  try {
    const summary = await creatorEarningsService.getSummary(getAuthedUser(req).id);
    res.json(summary);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 销售明细 ──────────────────────────────────────────────────────────────

router.get('/earnings/sales', authMiddleware, requireCreator, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query['page'] ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query['limit'] ?? 20)));
    const result = await creatorEarningsService.listSales(getAuthedUser(req).id, page, limit);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 提现申请 ──────────────────────────────────────────────────────────────

const withdrawalSchema = z.object({
  amount_cents: z.number().int().positive(),
  channel: z.enum(['alipay', 'wechat', 'bank']),
  account_info: z.string().min(2).max(256),
});

router.post('/earnings/withdrawals', authMiddleware, requireCreator, async (req, res) => {
  const parsed = withdrawalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await creatorEarningsService.createWithdrawal({
      userId: getAuthedUser(req).id,
      amountCents: parsed.data.amount_cents,
      channel: parsed.data.channel,
      accountInfo: parsed.data.account_info,
    });
    if (!result.ok) {
      const statusMap: Record<string, number> = {
        insufficient_balance: 422,
        minimum_withdrawal_100_yuan: 422,
        account_info_required: 400,
        amount_must_be_positive: 400,
      };
      res.status(statusMap[result.error!] ?? 400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/earnings/withdrawals', authMiddleware, requireCreator, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query['page'] ?? 1));
    const limit = Math.min(50, Math.max(1, Number(req.query['limit'] ?? 20)));
    const result = await creatorEarningsService.listWithdrawals(getAuthedUser(req).id, page, limit);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 公示期异议（任意登录用户） ────────────────────────────────────────────

const objectionSchema = z.object({
  reason: z.string().min(10).max(2000),
});

router.post('/modules/:id/objections', authMiddleware, async (req, res) => {
  const parsed = objectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const record = await creatorEarningsService.submitObjection({
      moduleId: req.params['id']!,
      userId: getAuthedUser(req).id,
      reason: parsed.data.reason,
    });
    res.status(201).json(record);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 作者申诉 ──────────────────────────────────────────────────────────────

const appealSchema = z.object({
  reason: z.string().min(10).max(2000),
});

router.post('/modules/:id/appeal', authMiddleware, async (req, res) => {
  const parsed = appealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await creatorEarningsService.submitAppeal({
      moduleId: req.params['id']!,
      userId: getAuthedUser(req).id,
      reason: parsed.data.reason,
    });
    if (!result.ok) {
      const statusMap: Record<string, number> = {
        module_not_found: 404,
        forbidden: 403,
        not_in_appealable_status: 409,
        appeal_already_pending: 409,
      };
      res.status(statusMap[result.error!] ?? 400).json({ error: result.error });
      return;
    }
    res.status(201).json(result.data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
