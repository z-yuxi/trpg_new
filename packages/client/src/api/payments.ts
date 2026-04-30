/**
 * 支付 / 订单
 * 产品设计依据：附录 H03：支付与货币系统
 * Phase 2 待实现（当前仅类型声明，后端 /payments 路由尚未完成）
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'alipay' | 'wechat' | 'coins';

export interface PaymentOrder {
  id: string;
  order_no: string;
  product_type: 'module' | 'ruleset' | 'membership';
  product_id: string;
  product_name: string;
  amount: number;
  payment_method: PaymentMethod;
  status: OrderStatus;
  pay_url?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export function createPaymentOrder(payload: {
  product_type: 'module' | 'ruleset' | 'membership';
  product_id: string;
  payment_method: PaymentMethod;
}): Promise<PaymentOrder> {
  return api.post('/payments/orders', payload, key());
}

export function getPaymentOrder(orderId: string): Promise<PaymentOrder> {
  return api.get(`/payments/orders/${orderId}`);
}

export function cancelPaymentOrder(orderId: string): Promise<void> {
  return api.post(`/payments/orders/${orderId}/cancel`, {}, key());
}

export function listPaymentOrders(params?: { limit?: number; offset?: number; status?: OrderStatus }): Promise<PaymentOrder[]> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/payments/orders${qs}`);
}
