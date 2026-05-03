/**
 * 模组（Module）
 * 产品设计依据：附录 E：模组编辑器设计方案
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export interface Module {
  id: string;
  name: string;
  title?: string;
  description?: string;
  author?: string;
  author_id?: string;
  cover_url?: string | null;
  status: 'draft' | 'pending' | 'published' | 'rejected' | 'archived';
  ruleset_id?: string;
  ruleset_name?: string;
  price?: number;
  difficulty?: string;
  min_players?: number;
  max_players?: number;
  style?: string;
  rating?: number;
  download_count?: number;
  reader_settings?: Record<string, unknown>;
  content?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface ListModulesParams {
  limit?: number;
  offset?: number;
  status?: string;
  keyword?: string;
  author_id?: string;
}

export function listModules(params?: ListModulesParams): Promise<{ data: Module[]; total: number }> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/modules${qs}`);
}

export function listMyModules(): Promise<Module[]> {
  return api.get('/modules/mine');
}

export function getModule(id: string): Promise<Module> {
  return api.get(`/modules/${id}`);
}

export function createModule(payload: { name: string; ruleset_id?: string }): Promise<Module> {
  return api.post('/modules', payload, key());
}

export function updateModule(id: string, payload: Partial<Module>): Promise<Module> {
  return api.put(`/modules/${id}`, payload);
}

export function autoSaveModule(id: string, payload: { content: unknown; updated_at: string }): Promise<void> {
  return api.put(`/modules/${id}/auto-save`, payload);
}

export function deleteModule(id: string): Promise<void> {
  return api.delete(`/modules/${id}`);
}

export function submitModule(id: string): Promise<void> {
  return api.post(`/modules/${id}/submit`, {}, key());
}

export function withdrawModule(id: string): Promise<void> {
  return api.post(`/modules/${id}/withdraw`, {}, key());
}

export function getModuleTerms(id: string): Promise<{ terms: Array<{ id: string; term: string }> }> {
  return api.get(`/modules/${id}/terms`);
}

export function saveModuleTerms(id: string, terms: string[]): Promise<{ terms: Array<{ term: string }> }> {
  return api.put(`/modules/${id}/terms`, { terms });
}

export interface ModuleEntity {
  type: 'npc' | 'scene' | 'clue' | 'item' | 'event';
  name: string;
  description: string;
  mentions?: string[];
}

export function applyModuleEntities(id: string, entities: ModuleEntity[]): Promise<{ updated_content: string }> {
  return api.post(`/modules/${id}/entities/apply`, { entities }, key());
}

// ── 实体库（Entity Library）────────────────────────────────
export type EntityType = 'npc' | 'scene' | 'clue';

export interface EntityItem {
  id: string;
  name: string;
  type: EntityType;
  description?: string;
}

export function listModuleEntities(
  moduleId: string,
  params?: { type?: EntityType; keyword?: string },
): Promise<{ data: EntityItem[] }> {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined);
  const qs = entries.length
    ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
    : '';
  return api.get(`/modules/${moduleId}/entities${qs}`);
}

