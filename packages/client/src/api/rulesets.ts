/**
 * 规则包（Ruleset）/ 版本 / 配方执行
 * 产品设计依据：附录 D01：规则引擎核心设计
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export interface Ruleset {
  id: string;
  name: string;
  version?: string;
  author?: string;
  author_id?: string;
  base_ruleset?: string | null;
  status?: 'draft' | 'pending' | 'published' | 'deprecated';
  description?: string;
  reader_settings?: Record<string, unknown>;
  recipe_source?: unknown;
  compiled?: unknown;
  created_at?: string;
  character_card_schema?: unknown;
  recruitment_fields?: unknown;
}

export interface RulesetVersion {
  id: string;
  ruleset_id: string;
  version_number: string;
  changelog?: string;
  snapshot?: unknown;
  created_at: string;
}

export interface ListRulesetsParams {
  limit?: number;
  offset?: number;
  status?: string;
  author_id?: string;
  keyword?: string;
}

export function listRulesets(params?: ListRulesetsParams): Promise<{ data: Ruleset[]; total: number }> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/rulesets${qs}`);
}

export function listMyRulesets(): Promise<{ data: Ruleset[]; total: number }> {
  return api.get('/rulesets/mine');
}

export function getRuleset(id: string): Promise<Ruleset> {
  return api.get(`/rulesets/${id}`);
}

export function createRuleset(payload: { name: string; version?: string; base_ruleset?: string | null }): Promise<Ruleset> {
  return api.post('/rulesets', payload, key());
}

export function updateRuleset(id: string, payload: Partial<Ruleset>): Promise<Ruleset> {
  return api.put(`/rulesets/${id}`, payload);
}

export function publishRuleset(id: string): Promise<void> {
  return api.post(`/rulesets/${id}/publish`, {}, key());
}

export function deprecateRuleset(id: string): Promise<void> {
  return api.post(`/rulesets/${id}/deprecate`, {}, key());
}

export function submitRulesetReview(id: string): Promise<void> {
  return api.post(`/rulesets/${id}/submit-review`, {}, key());
}

export function listRulesetVersions(id: string): Promise<RulesetVersion[]> {
  return api.get(`/rulesets/${id}/versions`);
}

export function createRulesetVersion(id: string, changelog: string): Promise<RulesetVersion> {
  return api.post(`/rulesets/${id}/versions`, { changelog }, key());
}

export function rollbackRulesetVersion(rulesetId: string, versionId: string): Promise<void> {
  return api.post(`/rulesets/${rulesetId}/versions/${versionId}/rollback`, {}, key());
}

export function executeRecipe(
  rulesetId: string,
  command: string,
  context: Record<string, unknown>
): Promise<unknown> {
  return api.post('/engine/execute', { ruleset_id: rulesetId, command, context }, key());
}
