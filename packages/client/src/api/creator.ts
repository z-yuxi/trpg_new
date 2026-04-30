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

export function getCreatorEarnings(): Promise<EarningsSummary> {
  return api.get('/creator/earnings');
}

export function applyWithdrawal(amount: number, accountInfo: Record<string, string>): Promise<{ id: string; status: string }> {
  return api.post('/creator/withdrawals', { amount, account_info: accountInfo }, key());
}
