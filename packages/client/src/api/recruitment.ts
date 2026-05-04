/**
 * 招募帖 / 申请 / 楼层 / 评论 / 点赞
 * 产品设计依据：附录 B：平台帖子与招募规范
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export interface RecruitmentPost {
  id: string;
  title: string;
  status: string;
  gm_user_id: string;
  ruleset_name?: string;
  module_name?: string | null;
  player_count: number;
  max_players: number;
  schedule_type?: string;
  tags?: string[];
  description?: string;
  created_at: string;
  campaign_id?: string | null;
  my_application_id?: string | null;
  my_application_status?: string | null;
  allow_ob?: boolean;
}

export interface RecruitmentApplication {
  id: string;
  post_id: string;
  user_id: string;
  nickname: string;
  avatar_url?: string;
  status: 'pending' | 'approved' | 'rejected' | 'confirmed' | 'cancelled';
  character_id?: string | null;
  note?: string;
  created_at: string;
}

export interface RecruitmentFloor {
  id: string;
  post_id: string;
  user_id: string;
  nickname: string;
  avatar_url?: string;
  content: string;
  floor_number: number;
  like_count: number;
  liked_by_me: boolean;
  created_at: string;
  comments: RecruitmentComment[];
}

export interface RecruitmentComment {
  id: string;
  floor_id: string;
  user_id: string;
  nickname: string;
  content: string;
  like_count: number;
  liked_by_me: boolean;
  created_at: string;
}

export interface ListRecruitmentParams {
  limit?: number;
  offset?: number;
  status?: string;
  tags?: string;
  keyword?: string;
  schedule_type?: string;
}

// ─── 招募帖 CRUD ─────────────────────────────────────────────────────────────

export function listRecruitments(params?: ListRecruitmentParams): Promise<RecruitmentPost[]> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/recruitment${qs}`);
}

export function getRecruitment(id: string): Promise<RecruitmentPost> {
  return api.get(`/recruitment/${id}`);
}

export function createRecruitment(payload: {
  title: string;
  ruleset_id: string;
  type?: string;
  module_id?: string | null;
  module_name?: string | null;
  max_players?: number;
  player_count_max?: number;
  schedule_type?: string;
  schedule_text?: string | null;
  description?: string;
  tags?: string[];
  allow_ob?: boolean;
  fields?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<RecruitmentPost> {
  return api.post('/recruitment', payload, key());
}

export function publishRecruitment(id: string): Promise<void> {
  return api.post(`/recruitment/${id}/publish`, {}, key());
}

export function closeRecruitment(id: string): Promise<void> {
  return api.post(`/recruitment/${id}/close`, {}, key());
}

export function dissolveRecruitment(id: string): Promise<void> {
  return api.post(`/recruitment/${id}/dissolve`, {}, key());
}

// ─── 申请 ───────────────────────────────────────────────────────────────────

export function applyToRecruitment(postId: string, payload: {
  character_id?: string | null;
  note?: string;
  fields?: Record<string, unknown>;
  ob?: boolean;
}): Promise<RecruitmentApplication> {
  const suffix = payload.ob ? '/ob' : '';
  return api.post(`/recruitment/${postId}/apply${suffix}`, payload, key());
}

export function reviewApplication(postId: string, applicationId: string, action: 'approve' | 'reject', reason?: string): Promise<void> {
  return api.post(`/recruitment/${postId}/applications/${applicationId}/review`, { action, ...(reason ? { reason } : {}) }, key());
}

export function confirmApplication(applicationId: string): Promise<void> {
  return api.post(`/recruitment/applications/${applicationId}/confirm`, {}, key());
}

export function listApplications(postId: string): Promise<RecruitmentApplication[]> {
  return api.get(`/recruitment/${postId}/applications`);
}

// ─── 楼层 ───────────────────────────────────────────────────────────────────

export function listFloors(postId: string): Promise<RecruitmentFloor[]> {
  return api.get(`/recruitment/${postId}/floors`);
}

export function deleteFloor(postId: string, floorId: string): Promise<void> {
  return api.delete(`/recruitment/${postId}/floors/${floorId}`);
}

export function likeFloor(postId: string, floorId: string): Promise<void> {
  return api.post(`/recruitment/${postId}/floors/${floorId}/like`, {}, key());
}

export function unlikeFloor(postId: string, floorId: string): Promise<void> {
  return api.delete(`/recruitment/${postId}/floors/${floorId}/like`);
}

// ─── 评论 ───────────────────────────────────────────────────────────────────

export function deleteComment(postId: string, floorId: string, commentId: string): Promise<void> {
  return api.delete(`/recruitment/${postId}/floors/${floorId}/comments/${commentId}`);
}

export function likeComment(postId: string, floorId: string, commentId: string): Promise<void> {
  return api.post(`/recruitment/${postId}/floors/${floorId}/comments/${commentId}/like`, {}, key());
}

export function unlikeComment(postId: string, floorId: string, commentId: string): Promise<void> {
  return api.delete(`/recruitment/${postId}/floors/${floorId}/comments/${commentId}/like`);
}
