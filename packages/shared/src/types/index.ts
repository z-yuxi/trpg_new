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
  cover_url: string | null;
  module_name: string | null;
  ruleset_name: string;
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
  description: string;
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
  derived_current: Record<string, { current: number; max: number; temp?: number }> | null;
  temporary_effects: Array<{ name: string; value: number; source?: string }> | null;
  equipment: string[] | null;
  skill_growth_marks: Record<string, boolean> | null;
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
  execute_at_story?: StoryTime | null;  // 可选：GM批准时填写的剧情到达时间
  status: MoveStatus;
  created_at: Date;
}

// ===== 聊天消息 =====
export type MessageType = 'narrative' | 'dice' | 'ooc' | 'system' | 'announcement' | 'clue_card' | 'time_tag';

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
  module_name?: string | null;
  player_count_max: number;
  player_count_joined?: number;
  schedule_text?: string | null;
  description?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
  status: RecruitmentStatus;
  created_at: Date;
}

export type RecruitmentApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface RecruitmentApplication {
  id: string;
  post_id: string;
  applicant_user_id: string;
  character_id: string | null;
  message: string;
  status: RecruitmentApplicationStatus;
  created_at: Date;
  updated_at: Date;
}

export interface RecruitmentComment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: Date;
}

// ===== 规则集 =====
export type RulesetStatus = 'draft' | 'reviewing' | 'published' | 'deprecated';

/** 命令图节点输入源 */
export type CommandInputSource =
  | { type: 'static'; value: unknown }
  | { type: 'ref'; node_id: string; output_key: string };

/** 命令图节点定义 */
export interface CommandGraphNode {
  node_id: string;
  atom_type: string;
  inputs: Record<string, CommandInputSource>;
}

/** 命令图定义 */
export interface CommandGraph {
  nodes: CommandGraphNode[];
  output_node_id: string;
}

/** 规则集命令定义 */
export interface RulesetCommand {
  name: string;
  description: string;
  aliases: string[];
  graph: CommandGraph;
}

/** 平台预置命令名称列表 */
export const PLATFORM_PRESET_COMMAND_NAMES = [
  'roll', 'check', 'initiative',
  'r', 'rh', 'nn',
  'ra', 'rc', 'sc', 'en', 'ti', 'li', 'init', 'ds',
] as const;
export type PlatformPresetCommandName = typeof PLATFORM_PRESET_COMMAND_NAMES[number];

/** 平台预置命令枚举 */
export enum PlatformPresetCommand {
  /** 通用掷骰（/r 2d6） */
  r = 'r',
  /** 暗骰，结果仅 GM 可见 */
  rh = 'rh',
  /** 旁白（系统消息） */
  nn = 'nn',
  /** 投掷骰子 */
  roll = 'roll',
  /** 技能检定（通用） */
  check = 'check',
  /** 先攻 */
  initiative = 'initiative',
  /** 属性检定（1d100 ≤ 属性值） */
  ra = 'ra',
  /** 标准检定（1d100 ≤ 技能值） */
  rc = 'rc',
  /** 理智检定 */
  sc = 'sc',
  /** 成长检定 */
  en = 'en',
  /** 幕间成长（批量 en 所有已标记技能） */
  ti = 'ti',
  /** 灵感检定（反向检定，> 值为成功） */
  li = 'li',
  /** 先攻（短别名） */
  init = 'init',
  /** 死亡豁免 */
  ds = 'ds',
}

/** 自定义命令参数映射项 */
export interface CustomCommandParamMapping {
  /** 参数名 */
  param_name: string;
  /** 来源类型 */
  source: 'user_input' | 'character_attribute' | 'character_skill' | 'fixed_value';
  /** 固定值（source=fixed_value 时使用） */
  fixed_value?: unknown;
  /** 关联的属性/技能名（source=character_* 时使用） */
  field_name?: string;
}

/** 自定义命令定义 */
export interface CustomCommand {
  /** 触发词 */
  trigger: string;
  /** 描述 */
  description: string;
  /** 别名列表 */
  aliases: string[];
  /** 是否仅 GM 可用 */
  gm_only: boolean;
  /** 参数映射表 */
  input_mapping: CustomCommandParamMapping[];
  /** 命令绑定的执行图 */
  graph: CommandGraph;
}

export interface Ruleset {
  id: string;
  author_id: string | null;
  name: string;
  version: string;
  description: string;
  parent_ruleset_id: string | null;
  /** 继承来源（批次4新增，等同 parent_ruleset_id，取 parent_id 字段） */
  parent_id?: string | null;
  /** 被 fork 次数 */
  fork_count?: number;
  /** 乐观锁版本号 */
  lock_version?: number;
  atoms: object;
  connections: object;
  commands: object;
  character_card_schema: object;
  status: RulesetStatus;
  created_at: Date;
}

/** 规则集版本快照 */
export interface RulesetVersion {
  id: string;
  ruleset_id: string;
  version_number: string;
  snapshot: {
    atoms: object;
    connections: object;
    commands: object;
    character_card_schema: object;
  };
  changelog: string;
  created_at: Date;
}

/** 两个版本之间的 diff */
export interface RulesetVersionDiff {
  nodes: {
    added: Array<{ node_id: string; atom_type: string }>;
    removed: Array<{ node_id: string; atom_type: string }>;
    modified: Array<{ node_id: string; atom_type: string; changed_fields: string[] }>;
  };
  connections: {
    added: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
    removed: Array<{ source: string; target: string; sourceHandle?: string; targetHandle?: string }>;
  };
  commands: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  // 旧字段兼容（废弃，勿新增使用）
  added_nodes: string[];
  removed_nodes: string[];
  modified_nodes: string[];
  added_connections: string[];
  removed_connections: string[];
}

/** fork 操作结果 */
export interface ForkResult {
  new_ruleset: Ruleset;
  source_fork_count: number;
}

/** mergeFromParent 合并结果 */
export interface MergeConflict {
  node_id: string;
  type: 'modified_both' | 'deleted_ours' | 'deleted_theirs';
  our_node?: object;
  their_node?: object;
}

export interface MergeResult {
  status: 'clean' | 'conflicts';
  merged_graph: {
    atoms: object[];
    connections: object[];
  } | null;
  conflicts: MergeConflict[];
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

// ===== 模组与资产库 =====
export type ModuleStatus = 'draft' | 'public' | 'archived' | 'reviewing' | 'public_notice' | 'suspended';

/** 模组额外元数据（存于 modules.metadata JSON 列） */
export interface ModuleMetadata {
  tags?: string[];
  estimated_hours?: number;
}

/** 模组举报类型 */
export type ModuleReportType = 'plagiarism' | 'violation' | 'other';

/** 模组大纲条目（发布时自动生成缓存） */
export interface ModuleOutlineItem {
  id: string;
  type: 'heading' | 'scene' | 'npc' | 'event' | 'clue' | 'check' | 'dialog';
  label: string;
  level?: number; // heading 层级 1-3
}

/** 模组内业务块基础接口 */
export interface ModuleBlock {
  id: string;
  type: 'scene' | 'npc' | 'event' | 'clue' | 'check' | 'dialog';
  attrs: Record<string, unknown>;
}

export interface Module {
  id: string;
  name: string;
  author_id: string;
  author_name?: string;
  ruleset_id: string;
  ruleset_name?: string;
  description: string;
  cover_url: string;
  status: ModuleStatus;
  difficulty?: 'easy' | 'normal' | 'hard' | null;
  min_players?: number | null;
  max_players?: number | null;
  style?: string | null;
  price: number;
  rating: number;
  download_count: number;
  /** TipTap ProseMirror JSON 文档（仅详情接口返回） */
  content?: string | null;
  /** 大纲缓存（发布时生成） */
  outline?: ModuleOutlineItem[] | null;
  /** 正文字数统计 */
  word_count?: number;
  /** 最近自动保存时间 */
  auto_saved_at?: Date | null;
  /** 元数据（标签/时长等） */
  metadata?: ModuleMetadata | null;
  /** 提交审核时间 */
  submitted_at?: Date | null;
  /** 公示期结束时间 */
  public_notice_end_at?: Date | null;
  /** 下架原因 */
  suspended_reason?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ModuleQueryFilter {
  keyword?: string;
  ruleset_id?: string;
  sort?: 'hot' | 'new' | 'rating';
  page?: number;
  limit?: number;
}

/** 创建模组请求体 */
export interface CreateModuleRequest {
  name: string;
  ruleset_id: string;
  description?: string;
}

/** 更新模组请求体 */
export interface UpdateModuleRequest {
  name?: string;
  description?: string;
  content?: string;
}

/** 自动保存请求体 */
export interface AutoSaveModuleRequest {
  content: string;
  word_count?: number;
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
  story_time_entered?: StoryTime | null;  // 可选：GM填写的剧情到达时间
  story_time_left?: StoryTime | null;
  move_type: MoveType;
  created_at: Date;
}

// ===== 网格地图 =====
export interface GridOverlay {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
}

export interface GridToken {
  id: string;
  entity_type: 'character' | 'npc' | 'object';
  entity_id: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

export interface GridMap {
  id: string;
  campaign_id: string;
  scene_id: string;
  cols: number;
  rows: number;
  cell_size: number;
  background_image_url: string | null;
  tokens: GridToken[];
  overlays: GridOverlay[];
  updated_at: Date;
}

// ===== 规则引擎 =====

/**
 * 预览执行时传入的模拟角色上下文。
 * key = 属性/技能名，value = 数值
 */
export interface MockContext {
  attributes: Record<string, number>;   // e.g. { "力量": 60, "体质": 55 }
  skills: Record<string, number>;       // e.g. { "侦查": 70, "图书馆": 40 }
  resources: Record<string, { current: number; max: number }>;  // e.g. { "HP": { current: 10, max: 14 } }
}

/**
 * execute 端点请求体（ruleset_id 已由路径参数 :id 承担，不出现在请求体）。
 * context 与 mock_context 二选一；两者同时存在时优先 mock_context。
 */
export interface ExecuteRequest {
  /** 完整命令字符串，e.g. "/rc 侦查 60" */
  command: string;
  /** 命令参数（命令字符串无法解析时的备用，键名需与图节点输入键匹配） */
  params?: Record<string, unknown>;
  /** 真实角色上下文 */
  context?: {
    character_id: string;
    campaign_id: string;
    scene_id?: string;
  };
  /** 编辑器预览时使用的模拟角色数据，不需要真实角色/团 */
  mock_context?: MockContext;
}

export interface NodeExecutionLog {
  node_id: string;
  node_type: string;
  inputs: Record<string, unknown>;
  output: unknown;
  duration_ms: number;
}

/** execute 端点返回体 */
export interface ExecuteResponse {
  success: boolean;
  /** 可读的最终结果描述 */
  result: string;
  dice_rolls: Array<{ expression: string; value: number; detail: string }>;
  logs: Array<{
    node_id: string;
    atom_type: string;
    inputs: Record<string, unknown>;
    output: unknown;
    duration_ms: number;
  }>;
  error?: string;
  /** 解析出的命令名（如 'en', 'sc', 'ra'），供调用方进行后处理 */
  command_name?: string;
  /** 图执行的原始输出，供调用方读取结构化结果 */
  raw_output?: unknown;
}

// ===== 文字艺术主题 =====
export type ThemeType = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';

// ===== 职业模板 =====
export type OccupationMode = 'static' | 'leveled';

/** 等级特性（DND 风格升级表的单个等级描述） */
export interface LevelFeatures {
  proficiency_bonus?: number;
  features?: string[];
  spell_slots?: Record<string, number>;
  extra_attack?: number;
  [key: string]: unknown;
}

/** 职业模板 */
export interface OccupationTemplate {
  id: string;
  ruleset_id: string;
  name: string;
  description: string;
  /** 'static' = COC 一次性应用；'leveled' = DND 等级成长 */
  mode: OccupationMode;
  /** 属性成长公式，如 { "STR": "1d4", "HP": "1d8" } */
  attribute_growth?: Record<string, string>;
  /** 技能点公式字符串，如 "EDU*2+APP*2"（COC 用） */
  skill_point_formula?: string;
  /** 信用评级范围（COC 用） */
  credit_rating?: { min: number; max: number };
  /** 本职技能列表（COC 用） */
  occupation_skills?: string[];
  /** 等级成长表（DND 用），键为等级数字 */
  progression_table?: Record<number, LevelFeatures>;
  /** 特性节点图（规则引擎扩展，预留字段） */
  feature_graph?: { atoms: unknown[]; connections: unknown[] };
  /** 默认起始装备列表 */
  starting_equipment?: string[];
  created_at: Date;
  updated_at: Date;
}

export * from './events';
