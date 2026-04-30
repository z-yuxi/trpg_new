/**
 * 会员订阅 / 订单
 * 产品设计依据：附录 H01：会员体系设计
 */
import { api } from '../utils/api';
import type { MembershipTier } from '@trpg/shared';

function key(): string { return crypto.randomUUID(); }

export interface MembershipPlan {
  id: string;
  tier: MembershipTier;
  name: string;
  price: number;
  duration_days: number;
  benefits: string[];
  is_current?: boolean;
}

export interface MembershipOrder {
  id: string;
  plan_id: string;
  tier: MembershipTier;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  payment_method?: string;
  paid_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export function listMembershipPlans(): Promise<MembershipPlan[]> {
  return api.get('/membership/plans');
}

/** GET /membership/benefits — 返回当前有效档位与权益列表 */
export function getMembershipBenefits(): Promise<{ tier: MembershipTier; benefits: string[]; expires_at: string | null }> {
  return api.get('/membership/benefits');
}

/** POST /membership/orders — sku 由前端 SKU_CATALOG 定义，channel 为支付渠道 */
export function createMembershipOrder(sku: string, channel: 'alipay' | 'wechat'): Promise<MembershipOrder> {
  return api.post('/membership/orders', { sku, channel }, key());
}

export function getMembershipOrder(orderId: string): Promise<MembershipOrder> {
  return api.get(`/membership/orders/${orderId}`);
}

export function cancelMembershipOrder(orderId: string): Promise<void> {
  return api.post(`/membership/orders/${orderId}/cancel`, {}, key());
}

export function listMembershipOrders(): Promise<MembershipOrder[]> {
  return api.get('/membership/orders');
}
