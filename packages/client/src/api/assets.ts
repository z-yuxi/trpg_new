/**
 * 探索 / 资产库（AssetLibrary）
 * 产品设计依据：产品设计.md §14 叙阅器
 */
import { api } from '../utils/api';
import type { Module } from './modules';
import type { Ruleset } from './rulesets';

export interface AssetListParams {
  limit?: number;
  offset?: number;
  keyword?: string;
  tags?: string;
  ruleset_id?: string;
  status?: string;
  sort?: 'newest' | 'popular' | 'rating';
  author_id?: string;
}

export function discoverModules(params?: AssetListParams): Promise<{ data: Module[]; total: number }> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/modules${qs}`);
}

export function discoverRulesets(params?: AssetListParams): Promise<{ data: Ruleset[]; total: number }> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/rulesets${qs}`);
}
