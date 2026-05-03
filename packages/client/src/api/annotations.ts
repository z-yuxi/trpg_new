/**
 * 划线笔记（Annotations）/ 阅读进度
 * 产品设计依据：产品设计.md §14.6 划线笔记的三级权限
 *
 * 服务端接口：
 *   GET    /annotations?asset_type=&asset_id=
 *   POST   /annotations  { asset_type, asset_id, selected_text, color?, note?, range_start, range_end }
 *   PATCH  /annotations/:id  { color?, note? }
 *   DELETE /annotations/:id
 *   GET    /reading-progress/:type/:assetId
 *   PUT    /reading-progress/:type/:assetId  { scroll_percent }
 */
import { api } from '../utils/api';

export type AssetType = 'module' | 'ruleset';
export type AnnotationColor = 'yellow' | 'green' | 'blue' | 'red';

export interface Annotation {
  id: string;
  asset_type: AssetType;
  asset_id: string;
  user_id: string;
  selected_text: string;
  color: AnnotationColor;
  note: string | null;
  range_start: number;
  range_end: number;
  created_at: string;
  updated_at: string;
}

export interface ReadingProgress {
  scroll_percent: number;
  updated_at: string;
}

export function listAnnotations(params: { asset_type: AssetType; asset_id: string }): Promise<Annotation[]> {
  return api.get(`/annotations?asset_type=${params.asset_type}&asset_id=${encodeURIComponent(params.asset_id)}`);
}

export function createAnnotation(payload: {
  asset_type: AssetType;
  asset_id: string;
  selected_text: string;
  color?: AnnotationColor;
  note?: string | null;
  range_start: number;
  range_end: number;
}): Promise<Annotation> {
  return api.post('/annotations', payload);
}

export function updateAnnotation(id: string, payload: { color?: AnnotationColor; note?: string | null }): Promise<Annotation> {
  return api.patch(`/annotations/${id}`, payload);
}

export function deleteAnnotation(id: string): Promise<void> {
  return api.delete(`/annotations/${id}`);
}

export function updateReadingProgress(assetType: AssetType, assetId: string, scrollPercent: number): Promise<void> {
  return api.put(`/reading-progress/${assetType}/${assetId}`, { scroll_percent: scrollPercent });
}

export function getReadingProgress(assetType: AssetType, assetId: string): Promise<ReadingProgress | null> {
  return api.get(`/reading-progress/${assetType}/${assetId}`);
}
