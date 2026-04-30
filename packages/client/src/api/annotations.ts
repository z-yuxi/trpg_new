/**
 * 划线笔记（Annotations）/ 阅读进度
 * 产品设计依据：产品设计.md §14.6 划线笔记的三级权限
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export type AssetType = 'module' | 'ruleset';

export interface Annotation {
  id: string;
  asset_type: AssetType;
  asset_id: string;
  user_id: string;
  content: string;
  quote?: string;
  position?: Record<string, unknown>;
  visibility: 'private' | 'friends' | 'public';
  created_at: string;
  updated_at?: string;
}

export interface ReadingProgress {
  asset_type: AssetType;
  asset_id: string;
  position: Record<string, unknown>;
  percent?: number;
  updated_at: string;
}

export function listAnnotations(assetType: AssetType, assetId: string): Promise<Annotation[]> {
  return api.get(`/annotations/${assetType}/${assetId}`);
}

export function createAnnotation(assetType: AssetType, assetId: string, payload: {
  content: string;
  quote?: string;
  position?: Record<string, unknown>;
  visibility: 'private' | 'friends' | 'public';
}): Promise<Annotation> {
  return api.post(`/annotations/${assetType}/${assetId}`, payload, key());
}

export function updateAnnotation(id: string, payload: { content?: string; visibility?: 'private' | 'friends' | 'public' }): Promise<Annotation> {
  return api.put(`/annotations/${id}`, payload);
}

export function deleteAnnotation(id: string): Promise<void> {
  return api.delete(`/annotations/${id}`);
}

export function updateReadingProgress(assetType: AssetType, assetId: string, payload: { position: Record<string, unknown>; percent?: number }): Promise<void> {
  return api.put(`/reading-progress/${assetType}/${assetId}`, payload);
}

export function getReadingProgress(assetType: AssetType, assetId: string): Promise<ReadingProgress | null> {
  return api.get(`/reading-progress/${assetType}/${assetId}`);
}
