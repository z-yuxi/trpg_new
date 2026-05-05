/**
 * payGate — 会员权益拦截中间件工厂（附录 N）
 *
 * 用法：
 *   router.get('/export', authMiddleware, payGate('log_export'), handler)
 *
 * 行为：
 *   - 用户无权益 → 403 with { error, required_tier, benefit_key }
 *   - 用户有权益 → 记录 audit 日志 → next()
 *
 * 注意：必须在 authMiddleware 之后使用（依赖 req.user）
 */
import type { Request, Response, NextFunction } from 'express';
import { membershipService } from '../services/membership-service.js';
import type { BenefitKey, MembershipTier } from '@trpg/shared';
import { MEMBERSHIP_BENEFITS } from '@trpg/shared';
import { logInfo } from '../utils/structured-logger.js';

/** 计算拥有某权益所需的最低档位 */
function requiredTierFor(key: BenefitKey): MembershipTier {
  if (MEMBERSHIP_BENEFITS.pro.includes(key)) return 'pro';
  if (MEMBERSHIP_BENEFITS.creator.includes(key)) return 'creator';
  return 'pro'; // 默认
}

/**
 * payGate 中间件工厂
 * @param key 需要的权益 key（见 shared BenefitKey）
 */
export function payGate(key: BenefitKey) {
  return async function payGateMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: '请先登录', benefit_key: key });
      return;
    }

    const allowed = await membershipService.checkBenefit(user, key);
    if (!allowed) {
      const requiredTier = requiredTierFor(key);
      res.status(403).json({
        error: `此功能需要 ${requiredTier === 'pro' ? 'Pro 会员' : 'Creator 会员'} 或更高等级`,
        benefit_key: key,
        required_tier: requiredTier,
        current_tier: user.subscription_type,
      });
      return;
    }

    // 写入审计日志（异步，不阻塞响应）
    process.nextTick(() => {
      logInfo('BENEFIT_ACCESS', `${key} by ${user.id}`, {
        benefit_key: key,
        userId: user.id,
        method: req.method,
        path: req.path,
        tier: user.subscription_type,
      });
    });

    next();
  };
}
