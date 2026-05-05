/**
 * 用户 / 账号设置 / 关注
 * 产品设计依据：附录 I01：账号与基础设施 / 附录 I：个人中心
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export interface UserProfile {
  id: string;
  uid: number;
  nickname: string;
  avatar_url?: string;
  user_type: string[];
  subscription_type: 'free' | 'pro' | 'creator';
  is_following?: boolean;
  follower_count?: number;
  following_count?: number;
  created_at?: string;
}

export interface UserMe {
  id: string;
  uid: number;
  phone?: string;
  nickname: string;
  avatar_url?: string;
  user_type: string[];
  subscription_type: 'free' | 'pro' | 'creator';
  subscription_expires_at?: string | null;
  coins?: number;
  creator_level?: number;
  is_creator?: boolean;
}

export interface NotificationSettings {
  system: boolean;
  recruit: boolean;
  dm: boolean;
  mention: boolean;
}

export interface PrivacySettings {
  /** 个人主页可见性：public/friends/private */
  profile_visibility?: 'public' | 'friends' | 'private';
  /** 旧字段兼容 */
  profile_public?: boolean;
  /** 在线状态可见性 */
  online_visible?: boolean;
  /** 跑团历史可见性 */
  campaign_history_public?: boolean;
  /** 私信权限：all/following/none */
  dm_visibility?: 'all' | 'following' | 'none';
  allow_stats?: boolean;
  allow_ai_train?: boolean;
  /** 允许 AI 读取社区社交内容（帖子/评论/组队需求），用于智能匹配 */
  allow_ai_social?: boolean;
  /** 允许 AI 读取原创创作内容（模组/跑团记录/原创文稿），用于匹配创作同好 */
  allow_ai_creative?: boolean;
  show_campaigns?: boolean;
  show_characters?: boolean;
  allow_dm_from?: 'all' | 'following' | 'none';
}

export interface ContentPreferences {
  content_rating?: string[];
  excluded_tags?: string[];
  preferred_tags?: string[];
  rule_prefs?: string[];
  genre_prefs?: string[];
}

// ─── 自己 ───────────────────────────────────────────────────────────────────

export function getMe(): Promise<{ user?: UserMe } | UserMe> {
  return api.get('/users/me');
}

export function getMyStats(): Promise<{ joined_campaigns: number; created_campaigns: number; total_hours: number }> {
  return api.get('/users/me/stats');
}

export function updateMyProfile(payload: {
  nickname?: string;
  avatar_url?: string;
  intro?: string;
  tags?: string[];
}): Promise<{ user?: UserMe } | UserMe> {
  return api.put('/users/me', payload);
}

export function getMySettings(): Promise<Record<string, unknown>> {
  return api.get('/users/me/settings');
}

export function updatePassword(currentPassword: string, newPassword: string): Promise<void> {
  return api.put('/users/me/password', { current_password: currentPassword, new_password: newPassword });
}

export function updatePrivacy(payload: PrivacySettings): Promise<void> {
  return api.put('/users/me/privacy', payload);
}

export function updateNotificationSettings(payload: NotificationSettings): Promise<void> {
  return api.put('/users/me/notification-settings', payload);
}

export function updateContentPreferences(payload: ContentPreferences): Promise<void> {
  return api.put('/users/me/content-preferences', payload);
}

export function exportMyData(): Promise<void> {
  return api.post('/users/me/export-data', {}, key());
}

export function deleteMyAccount(confirm: string): Promise<void> {
  return api.post('/users/me/delete-account', { confirm }, key());
}

export function activateCreator(): Promise<void> {
  return api.post('/users/me/activate-creator', {}, key());
}

// ─── 他人主页 ────────────────────────────────────────────────────────────────

export function getUserProfile(uid: string): Promise<UserProfile> {
  return api.get(`/users/${uid}/profile`);
}

export function getUserHostedCampaigns(uid: string): Promise<unknown[]> {
  return api.get(`/users/${uid}/hosted-campaigns`);
}

export function getUserCampaigns(uid: string): Promise<unknown[]> {
  return api.get(`/users/${uid}/campaigns`);
}

export function getUserCreatedModules(uid: string): Promise<unknown[]> {
  return api.get(`/users/${uid}/created-modules`);
}

// ─── 关注 ───────────────────────────────────────────────────────────────────

export function followUser(uid: string): Promise<{ follower_count: number }> {
  return api.post(`/users/${uid}/follow`, {}, key());
}

export function unfollowUser(uid: string): Promise<void> {
  return api.delete(`/users/${uid}/follow`);
}

export function getFollowStatus(uid: string): Promise<{ following: boolean }> {
  return api.get(`/users/${uid}/follow-status`);
}

export function getFollowers(uid: string, params?: { limit?: number; offset?: number }): Promise<UserProfile[]> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/users/${uid}/followers${qs}`);
}

export function getFollowing(uid: string, params?: { limit?: number; offset?: number }): Promise<UserProfile[]> {
  const qs = params
    ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString()
    : '';
  return api.get(`/users/${uid}/following${qs}`);
}
