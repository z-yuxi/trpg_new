/**
 * MembershipService
 *
 * 职责：
 *   - 检查用户是否拥有某项权益（含到期自动降级）
 *   - 降级过期订阅（subscription_expires_at < now → free）
 *   - 写入 subscription_events（变更审计）
 *   - 查询用户有效档位
 */
import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { User, MembershipTier, BenefitKey } from '@trpg/shared';
import { MEMBERSHIP_BENEFITS } from '@trpg/shared';

export class MembershipService {
  /**
   * 获取用户当前有效档位（自动处理到期降级）
   *
   * - 若 subscription_expires_at < now，实时降级为 free 并写入 expire 事件
   * - 不依赖 cron，每次查询时惰性检查
   */
  async getEffectiveTier(userId: string): Promise<MembershipTier> {
    const user = await db('users')
      .where({ id: userId })
      .select('subscription_type', 'subscription_expires_at')
      .first()
      .catch(() => null) as Pick<User, 'subscription_type' | 'subscription_expires_at'> | null;

    if (!user) return 'free';

    const tier = user.subscription_type as MembershipTier;
    if (tier === 'free') return 'free';

    // 检查到期
    const expiresAt = user.subscription_expires_at;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      // 惰性降级
      await this.expireMembership(userId, tier);
      return 'free';
    }

    return tier;
  }

  /**
   * 检查用户是否拥有某项权益
   * admin 用户绕过所有检查。
   */
  async checkBenefit(user: Pick<User, 'id' | 'user_type' | 'subscription_type'>, key: BenefitKey): Promise<boolean> {
    // admin 全权限
    if (Array.isArray(user.user_type) && user.user_type.includes('admin')) return true;

    const tier = await this.getEffectiveTier(user.id);
    return MEMBERSHIP_BENEFITS[tier].includes(key);
  }

  /**
   * 手动写入订阅事件（订阅/续费/升级/降级/赠送）
   */
  async recordEvent(params: {
    userId: string;
    eventType: 'subscribe' | 'renew' | 'upgrade' | 'downgrade' | 'expire' | 'cancel' | 'grant';
    fromTier: MembershipTier | null;
    toTier: MembershipTier;
    orderId?: string | null;
    expiresAt?: Date | null;
    operatorId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await db('subscription_events').insert({
      id: generateId(),
      user_id: params.userId,
      event_type: params.eventType,
      from_tier: params.fromTier,
      to_tier: params.toTier,
      order_id: params.orderId ?? null,
      expires_at: params.expiresAt ?? null,
      operator_id: params.operatorId ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  }

  /**
   * 到期降级（internaluse by getEffectiveTier）
   */
  private async expireMembership(userId: string, fromTier: MembershipTier): Promise<void> {
    await db('users').where({ id: userId }).update({
      subscription_type: 'free',
      subscription_expires_at: null,
    });
    await this.recordEvent({
      userId,
      eventType: 'expire',
      fromTier,
      toTier: 'free',
      metadata: { auto_expired: true },
    });
  }

  /**
   * 运营后台：手动授予会员（含到期时间）
   */
  async grant(params: {
    targetUserId: string;
    tier: 'pro' | 'creator';
    expiresAt: Date;
    operatorId: string;
  }): Promise<void> {
    const current = await db('users')
      .where({ id: params.targetUserId })
      .select('subscription_type')
      .first()
      .catch(() => null) as { subscription_type: string } | null;

    await db('users').where({ id: params.targetUserId }).update({
      subscription_type: params.tier,
      subscription_expires_at: params.expiresAt,
    });

    await this.recordEvent({
      userId: params.targetUserId,
      eventType: 'grant',
      fromTier: (current?.subscription_type as MembershipTier) ?? 'free',
      toTier: params.tier,
      expiresAt: params.expiresAt,
      operatorId: params.operatorId,
    });
  }
}

export const membershipService = new MembershipService();
