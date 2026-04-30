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

export function getTrendingModules(limit = 4): Promise<{ data: TrendingModule[] }> {
  return api.get(`/trending/modules?limit=${limit}`);
}

export function getTrendingStories(limit = 4): Promise<{ data: TrendingStory[] }> {
  return api.get(`/trending/stories?limit=${limit}`);
}
