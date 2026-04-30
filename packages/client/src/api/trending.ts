import { api } from '../utils/api';

export interface TrendingModule {
  id: string;
  name: string;
  description: string;
  cover_url: string;
  author_name: string | null;
  hot_score: number;
  top_badge: { type: 'featured' | 'comment' | 'reaction'; count: number };
}

export interface TrendingStory {
  id: string;
  title: string;
  summary: string;
  author_nickname: string | null;
  hot_score: number;
  top_badge: { type: 'featured' | 'comment' | 'reaction'; count: number };
}

export interface TrendingResult<T> {
  data: T[];
  /** true 表示无符合质量阈值的内容，前端应隐藏整个区块 */
  hidden: boolean;
  count: number;
}

export function getTrendingModules(limit = 4): Promise<TrendingResult<TrendingModule>> {
  return api.get(`/trending/modules?limit=${limit}`);
}

export function getTrendingStories(limit = 4): Promise<TrendingResult<TrendingStory>> {
  return api.get(`/trending/stories?limit=${limit}`);
}
