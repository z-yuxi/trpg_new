/**
 * AI 配额中间件
 *
 * 月度配额（H04 § 3）：
 * - 免费版：全部 0（AI 功能需要升级会员）
 * - 专业版：模组导入 3 / 智能校对 20 / 日志摘要 5 / 规则生成 3（每月）
 * - 创作者版：模组导入 10 / 智能校对 100 / 日志摘要 15 / 规则生成 10（每月）
 *
 * 计费口径：仅 status='success' 的记录计入配额，失败不扣次数。
 */
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { metrics } from '../utils/business-metrics';
import type { TaskType } from '../services/ai-service';

type MembershipType = 'free' | 'pro' | 'creator';

const MONTHLY_QUOTA: Record<MembershipType, Record<TaskType, number>> = {
  free:    { import_module: 0,  check_text: 0,   log_summary: 0,  generate_recipe: 0  },
  pro:     { import_module: 3,  check_text: 20,  log_summary: 5,  generate_recipe: 3  },
  creator: { import_module: 10, check_text: 100, log_summary: 15, generate_recipe: 10 },
};

export function checkAiQuota(taskType: TaskType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.user!;
    const membership = (user.subscription_type as MembershipType | undefined) ?? 'free';
    // creator 会员同时也能享受 pro 配额的超集，直接按 subscription_type 映射
    const effectiveTier: MembershipType =
      membership === 'creator' ? 'creator' : membership === 'pro' ? 'pro' : 'free';

    const quota = MONTHLY_QUOTA[effectiveTier][taskType];

    if (quota === 0) {
      res.status(403).json({
        error: 'AI_FEATURE_LOCKED',
        message: '当前会员等级不支持此 AI 功能，请升级为专业版或创作者版',
      });
      return;
    }

    // 计算本月已成功消耗次数
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const row = await db('ai_usage_log')
      .where('user_id', user.id)
      .where('task_type', taskType)
      .where('status', 'success')
      .where('created_at', '>=', monthStart)
      .count('id as c')
      .first<{ c: number | string }>();

    const used = Number(row?.c ?? 0);

    if (used >= quota) {
      metrics.inc('ai_quota_exceeded');
      res.status(429).json({
        error: 'AI_QUOTA_EXCEEDED',
        message: `本月 AI 使用次数已达上限（${used}/${quota}），下月自动重置`,
        used,
        quota,
      });
      return;
    }

    metrics.inc('ai_request');
    next();
  };
}
