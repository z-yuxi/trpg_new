/**
 * 团（Campaign）/ 场（Scene）/ 移动 / 路线图 / 线索 / OB 权限 / 网格地图
 * 产品设计依据：附录 C：跑团房间交互设计
 */
import { api } from '../utils/api';
import type { Campaign, Scene } from '@trpg/shared';

function key(): string { return crypto.randomUUID(); }

// ─── 类型 ──────────────────────────────────────────────────────────────────

export interface CampaignListItem {
  id: string;
  name: string;
  status: string;
  role: 'gm' | 'player';
  room_code: string;
  ruleset_name?: string;
  module_name?: string | null;
  cover_url?: string | null;
}

export interface SceneConnection {
  id: string;
  campaign_id: string;
  from_scene_id: string;
  to_scene_id: string;
  label?: string;
  travel_modes?: string[];
}

export interface Clue {
  id: string;
  campaign_id: string;
  title: string;
  content: string;
  theme?: string;
  is_visible: boolean;
  created_at: string;
}

export interface ObPermission {
  user_id: string;
  nickname: string;
  granted_at: string;
}

export interface TrajectoryMatrix {
  scenes: Array<{ id: string; name: string }>;
  characters: Array<{
    id: string;
    name: string;
    segments: Array<{
      scene_id: string;
      story_time_entered: { hour: number; minute: number } | null;
      story_time_left: { hour: number; minute: number } | null;
    }>;
  }>;
}

export interface PendingMove {
  id: string;
  character_id: string;
  character_name: string;
  from_scene_id: string;
  to_scene_id: string;
  requested_at: string;
  story_time_arrival?: { hour: number; minute: number } | null;
  travel_mode?: string | null;
}

// ─── 团 ────────────────────────────────────────────────────────────────────

export function listMyCampaigns(): Promise<CampaignListItem[]> {
  return api.get('/campaigns');
}

export function getCampaign(id: string): Promise<Campaign> {
  return api.get(`/campaigns/${id}`);
}

export function createCampaign(payload: {
  name: string;
  ruleset_id: string;
  module_id?: string | null;
}): Promise<{ id: string; room_code: string }> {
  return api.post('/campaigns', payload, key());
}

export function joinCampaignByCode(code: string): Promise<{ id: string }> {
  return api.post('/campaigns/join', { code }, key());
}

// ─── 场 ────────────────────────────────────────────────────────────────────

export function listScenes(campaignId: string): Promise<Scene[]> {
  return api.get(`/campaigns/${campaignId}/scenes`);
}

export function createScene(campaignId: string, payload: {
  name: string;
  type: 'spatial' | 'virtual' | 'lobby';
  description?: string;
  access_policy?: 'open' | 'gm_approve' | 'locked';
  history_visibility?: 'none' | 'recent' | 'all';
}): Promise<Scene> {
  return api.post(`/campaigns/${campaignId}/scenes`, payload, key());
}

export function updateScene(campaignId: string, sceneId: string, payload: Partial<Scene>): Promise<Scene> {
  return api.put(`/campaigns/${campaignId}/scenes/${sceneId}`, payload);
}

export function deleteScene(campaignId: string, sceneId: string): Promise<void> {
  return api.delete(`/campaigns/${campaignId}/scenes/${sceneId}`);
}

export function joinScene(campaignId: string, sceneId: string, characterId: string): Promise<void> {
  return api.post(`/campaigns/${campaignId}/scenes/${sceneId}/join`, { character_id: characterId }, key());
}

// ─── 网格地图 ───────────────────────────────────────────────────────────────

export function updateGridMapSettings(campaignId: string, sceneId: string, payload: { allow_player_token_drag: boolean }): Promise<void> {
  return api.put(`/campaigns/${campaignId}/scenes/${sceneId}/grid-map`, payload);
}

// ─── 移动 ───────────────────────────────────────────────────────────────────

export function listPendingMoves(campaignId: string): Promise<PendingMove[]> {
  return api.get(`/campaigns/${campaignId}/moves/pending`);
}

export function listUpcomingMoves(campaignId: string): Promise<PendingMove[]> {
  return api.get(`/campaigns/${campaignId}/moves/upcoming`);
}

export function approveMove(campaignId: string, moveId: string, payload?: { story_time_arrival?: { hour: number; minute: number } | null }): Promise<void> {
  return api.post(`/campaigns/${campaignId}/moves/${moveId}/approve`, payload ?? {}, key());
}

export function rejectMove(campaignId: string, moveId: string, reason: string): Promise<void> {
  return api.post(`/campaigns/${campaignId}/moves/${moveId}/reject`, { reason }, key());
}

export function forceMove(campaignId: string, payload: {
  character_id: string;
  to_scene_id: string;
  story_time_arrival?: { hour: number; minute: number } | null;
}): Promise<void> {
  return api.post(`/campaigns/${campaignId}/moves/force`, payload, key());
}

// ─── 路线图（场连接）──────────────────────────────────────────────────────────

export function listConnections(campaignId: string): Promise<SceneConnection[]> {
  return api.get(`/campaigns/${campaignId}/connections`);
}

export function createConnection(campaignId: string, payload: Omit<SceneConnection, 'id' | 'campaign_id'>): Promise<SceneConnection> {
  return api.post(`/campaigns/${campaignId}/connections`, payload, key());
}

export function updateConnection(campaignId: string, connId: string, payload: Partial<Omit<SceneConnection, 'id' | 'campaign_id'>>): Promise<SceneConnection> {
  return api.put(`/campaigns/${campaignId}/connections/${connId}`, payload);
}

export function deleteConnection(campaignId: string, connId: string): Promise<void> {
  return api.delete(`/campaigns/${campaignId}/connections/${connId}`);
}

// ─── 线索 ───────────────────────────────────────────────────────────────────

export function listClues(campaignId: string): Promise<Clue[]> {
  return api.get(`/campaigns/${campaignId}/clues`);
}

export function createClue(campaignId: string, payload: { title: string; content: string; theme?: string }): Promise<Clue> {
  return api.post(`/campaigns/${campaignId}/clues`, payload, key());
}

export function deleteClue(campaignId: string, clueId: string): Promise<void> {
  return api.delete(`/campaigns/${campaignId}/clues/${clueId}`);
}

export function updateClueStyle(campaignId: string, clueId: string, theme: string): Promise<void> {
  return api.post(`/campaigns/${campaignId}/clues/${clueId}/style`, { theme }, key());
}

// ─── OB 权限 ────────────────────────────────────────────────────────────────

export function listObPermissions(campaignId: string, sceneId: string): Promise<ObPermission[]> {
  return api.get(`/campaigns/${campaignId}/scenes/${sceneId}/ob-permissions`);
}

export function grantObPermission(campaignId: string, sceneId: string, userId: string): Promise<void> {
  return api.post(`/campaigns/${campaignId}/scenes/${sceneId}/ob-permissions/grant`, { user_id: userId }, key());
}

export function revokeObPermission(campaignId: string, sceneId: string, userId: string): Promise<void> {
  return api.post(`/campaigns/${campaignId}/scenes/${sceneId}/ob-permissions/revoke`, { user_id: userId }, key());
}

// ─── 轨迹矩阵 ───────────────────────────────────────────────────────────────

export function getTrajectoryMatrix(campaignId: string): Promise<TrajectoryMatrix> {
  return api.get(`/campaigns/${campaignId}/trajectory-matrix`);
}

// ─── 成员 ───────────────────────────────────────────────────────────────────

export function listCampaignMembers(campaignId: string): Promise<Array<{ user_id: string; nickname: string; character_id: string | null; role: 'gm' | 'player' }>> {
  return api.get(`/campaigns/${campaignId}/members`);
}
