/**
 * 创作者专区：素材资产 / 作品列表 / 收益
 * 产品设计依据：附录 H：市场与创作者经济
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export interface CreatorAsset {
  id: string;
  name: string;
  type: 'image' | 'audio' | 'file';
  url: string;
  size?: number;
  mime_type?: string;
  created_at: string;
}

export interface CreatorProduct {
  id: string;
  product_type: 'module' | 'ruleset';
  product_id: string;
  name: string;
  price: number;
  status: string;
  sales_count?: number;
  revenue?: number;
}

export interface EarningsSummary {
  total_earnings: number;
  available_balance: number;
  pending_withdrawal: number;
  this_month: number;
}

export interface SaleItem {
  id: string;
  product_name: string;
  product_type?: string;
  amount_cents: number;
  buyer_id?: string;
  created_at: string;
}

export interface WithdrawalItem {
  id: string;
  amount_cents: number;
  channel: string;
  account_info: string;
  status: 'pending' | 'processing' | 'done' | 'rejected';
  created_at: string;
  note?: string;
}

export function listCreatorAssets(params?: { limit?: number; offset?: number }): Promise<CreatorAsset[]> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/creator/assets${qs}`);
}

export function deleteCreatorAsset(assetId: string): Promise<void> {
  return api.delete(`/creator/assets/${assetId}`);
}

export function listCreatorProducts(): Promise<CreatorProduct[]> {
  return api.get('/creator/products');
}

/** 收益汇总 */
export function getCreatorEarnings(): Promise<EarningsSummary> {
  return api.get('/creator/earnings/summary');
}

/** 销售明细 */
export function listEarningsSales(page = 1, limit = 20): Promise<{ data: SaleItem[]; total: number }> {
  return api.get(`/creator/earnings/sales?page=${page}&limit=${limit}`);
}

/** 提现申请列表 */
export function listWithdrawals(page = 1, limit = 20): Promise<{ data: WithdrawalItem[]; total: number }> {
  return api.get(`/creator/earnings/withdrawals?page=${page}&limit=${limit}`);
}

/**
 * 申请提现
 * @param amountYuan 提现金额（元）
 * @param channel    收款渠道
 * @param accountInfo 收款账号字符串
 */
export function applyWithdrawal(
  amountYuan: number,
  channel: 'alipay' | 'wechat' | 'bank',
  accountInfo: string,
): Promise<{ id: string; status: string }> {
  return api.post('/creator/earnings/withdrawals', {
    amount_cents: Math.round(amountYuan * 100),
    channel,
    account_info: accountInfo,
  }, key());
}

/** 提交作者申诉（模组被暂停/拒绝后） */
export function submitAppeal(moduleId: string, reason: string): Promise<{ id: string }> {
  return api.post(`/creator/modules/${moduleId}/appeal`, { reason }, key());
}
