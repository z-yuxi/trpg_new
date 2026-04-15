// ===== 基础类型 =====
export interface StoryTime {
  day: number;
  hour: number;
  minute: number;
}

export type SnowflakeId = string;

// ===== 用户 =====
export interface User {
  id: string;                    // UUID v4
  uid: number;                   // 7位数字，从1000000起
  phone: string;
  password_hash: string;
  nickname: string;
  avatar_url: string;
  user_type: string[];           // ['player','gm','creator','admin']
  creator_level: number;         // 1-5
  coins: number;
  subscription_type: 'free' | 'pro' | 'creator';
  created_at: Date;
}

// ===== 团 =====
export type CampaignStatus = 'preparing' | 'running' | 'paused' | 'ended';

export interface Campaign {
  id: string;
  room_code: string;
  name: string;
  ruleset_id: string;
  module_id: string | null;
  gm_user_id: string;
  assistant_gm_ids: string[];
  global_story_time: StoryTime;
  status: CampaignStatus;
  allow_ob: boolean;
  is_listed_publicly: boolean;
  enable_trajectory_matrix: boolean;
  enable_grid_map: boolean;
  enable_scene_connections: boolean;
  created_at: Date;
}

// ===== 场 =====
export type SceneType = 'spatial' | 'virtual' | 'lobby';
export type HistoryVisibility = 'none' | 'recent' | 'all';

export interface Scene {
  id: string;
  campaign_id: string;
  name: string;
  type: SceneType;
  history_visibility: HistoryVisibility;
  visible_history_count: number;
  created_at: Date;
}

// ===== 角色卡 =====
export interface CharacterSheet {
  id: string;
  character_code: string;
  user_id: string;
  ruleset_id: string;
  name: string;
  occupation_id: string | null;
  avatar_url: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  derived_max: Record<string, { current: number; max: number; temp?: number }>;
  equipment: string[];
  background: string;
  avatar_custom_data: object | null;
  initial_snapshot: object | null;
  created_at: Date;
  updated_at: Date;
}

// ===== 角色场景状态 =====
export interface CharacterSceneState {
  id: string;
  character_id: string;
  campaign_id: string;
  current_spatial_scene_id: string | null;
  personal_story_time: StoryTime;
}

// ===== 角色实例（运行时） =====
export interface CharacterInstance {
  id: string;
  character_id: string;
  campaign_id: string;
  user_id: string;
  current_resources: Record<string, { current: number; max: number }>;
  temporary_effects: { effect_id: string; remaining_rounds?: number; source: string }[];
  current_spatial_scene_id?: string;
  personal_story_time: StoryTime;
  scheduled_move_id?: string;
  status: 'active' | 'left' | 'dead';
}

// ===== 角色卡模板 =====
export interface CharacterCard {
  card_id: string;
  template_ref: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number; temp?: number }>;
  statuses: { status_id: string; remaining_rounds?: number }[];
  avatar_custom_data?: object;
  initial_snapshot?: object;
  equipment: string[];
  background?: string;
}

// ===== 场参与 =====
export interface SceneParticipation {
  id: string;
  scene_id: string;
  character_id: string;
  joined_at: Date;
  left_at: Date | null;
}

// ===== 预约移动 =====
export type MoveStatus = 'pending' | 'approved' | 'executed' | 'cancelled';

export interface ScheduledMove {
  id: string;
  character_id: string;
  campaign_id: string;
  to_scene_id: string;
  execute_at_story: StoryTime;
  status: MoveStatus;
  created_at: Date;
}

// ===== 聊天消息 =====
export type MessageType = 'narrative' | 'dice' | 'ooc' | 'system' | 'announcement' | 'clue_card';

export interface ChatMessage {
  id: SnowflakeId;
  scene_id: string;
  campaign_id: string;
  sender_user_id: string;
  sender_character_id: string | null;
  content: string;
  message_type: MessageType;
  story_time: StoryTime | null;
  visible_to: string[] | null;
  client_timestamp: number;
  created_at: Date;
  metadata: Record<string, unknown> | null;
}

// ===== 场连接 =====
export interface SceneConnection {
  id: string;
  campaign_id: string;
  from_scene_id: string;
  to_scene_id: string;
  walk_duration: number;
  bike_duration: number | null;
  drive_duration: number | null;
  is_bidirectional: boolean;
  created_by: string;
  created_at: Date;
}

// ===== 招募帖 =====
export type RecruitmentType = 'gm_recruit' | 'player_seek';
export type RecruitmentStatus = 'open' | 'closed' | 'full';

export interface RecruitmentPost {
  id: string;
  poster_id: string;
  type: RecruitmentType;
  title: string;
  campaign_id: string | null;
  ruleset_id: string;
  player_count_max: number;
  status: RecruitmentStatus;
  created_at: Date;
}

// ===== 规则集 =====
export type RulesetStatus = 'draft' | 'published';

export interface Ruleset {
  id: string;
  name: string;
  version: string;
  parent_ruleset_id: string | null;
  atoms: object;
  connections: object;
  commands: object;
  character_card_schema: object;
  status: RulesetStatus;
  created_at: Date;
}

// ===== 团 NPC =====
export interface CampaignNpc {
  id: string;
  campaign_id: string;
  source_module_npc_id: string | null;
  name: string;
  display_name: string;
  avatar_url: string;
  description: string;
  voice_tips: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number }>;
  is_temporary: boolean;
  is_playable: boolean;
  is_active: boolean;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

// ===== 回合状态 =====
export interface CampaignRoundState {
  campaign_id: string;
  turn_order: string[];
  current_index: number;
  round_number: number;
  updated_at: Date;
}

// ===== 位置历史 =====
export type MoveType = 'scheduled' | 'force_move' | 'join' | 'leave';

export interface PositionHistory {
  id: string;
  campaign_id: string;
  character_id: string;
  scene_id: string;
  story_time_entered: StoryTime;
  story_time_left: StoryTime | null;
  move_type: MoveType;
  created_at: Date;
}

// ===== 规则引擎 =====
export interface ExecuteRequest {
  ruleset_id: string;
  command: string;
  params: Record<string, unknown>;
  context: {
    character_id: string;
    campaign_id: string;
    scene_id?: string;
  };
}

export interface NodeExecutionLog {
  node_id: string;
  node_type: string;
  inputs: Record<string, unknown>;
  output: unknown;
  duration_ms: number;
}

export interface ExecuteResponse {
  success: boolean;
  output: unknown;
  logs: NodeExecutionLog[];
}

// ===== 文字艺术主题 =====
export type ThemeType = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';

export * from './events';
