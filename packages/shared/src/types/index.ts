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
  subscription_expires_at: Date | null;
  created_at: Date;
}

/** 会员档位（别名，便于业务代码引用） */
export type MembershipTier = 'free' | 'pro' | 'creator';

/**
 * 会员权益 Key
 * 用于 membershipService.checkBenefit(user, key) 和 payGate 中间件
 */
export type BenefitKey =
  | 'log_export'           // 导出跑团日志
  | 'export_pdf'           // 导出 PDF 版日志
  | 'character_card_pdf'   // 导出角色卡 PDF
  | 'module_pdf'           // 导出模组 PDF
  | 'ai_summary'           // AI 剧情总结
  | 'ai_image'             // AI 配图
  | 'module_publish'       // 发布付费模组（需 creator）
  | 'ruleset_publish'      // 发布规则集到广场（需 creator）
  | 'advanced_analytics'   // 高级数据分析
  | 'custom_avatar_frame'  // 自定义头像框
  | 'priority_support';    // 优先客服

/** 每个会员档位享有的权益集合 */
export const MEMBERSHIP_BENEFITS: Record<MembershipTier, BenefitKey[]> = {
  free: [],
  pro: ['log_export', 'character_card_pdf', 'module_pdf', 'ai_summary', 'custom_avatar_frame', 'priority_support'],
  creator: [
    'log_export', 'export_pdf', 'character_card_pdf', 'module_pdf', 'ai_summary', 'ai_image',
    'module_publish', 'ruleset_publish', 'advanced_analytics',
    'custom_avatar_frame', 'priority_support',
  ],
};

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
/** 场景访问策略（迁移 022） */
export type SceneAccessPolicy = 'open' | 'gm_approve' | 'locked';
/** 进入场景的原因（迁移 022） */
export type JoinReason = 'join' | 'scheduled' | 'force_move' | 'ob';

export interface Scene {
  id: string;
  campaign_id: string;
  name: string;
  type: SceneType;
  description: string;
  history_visibility: HistoryVisibility;
  visible_history_count: number;
  /** 访问策略（默认 open） */
  access_policy: SceneAccessPolicy;
  created_at: Date;
}

/** 位置历史记录（轨迹矩阵数据源） */
export interface PositionHistoryEntry {
  id: string;
  campaign_id: string;
  character_id: string;
  scene_id: string;
  story_time_entered: { hour: number; minute: number } | null;
  story_time_left: { hour: number; minute: number } | null;
  move_type: JoinReason;
  created_at?: Date;
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
/** 招募帖生命周期状态（见产品设计 表8）
 * draft      草稿，未发布
 * open       招募中，有空位
 * full       满员，仍在招募（可进候补）
 * grouped    已成团，关联 campaign_id
 * closed     GM手动关闭或截止时间到
 * dissolved  房间解散后回写
 * archived   30天后自动归档
 */
export type RecruitmentStatus = 'draft' | 'open' | 'full' | 'grouped' | 'closed' | 'dissolved' | 'archived';

export type ScheduleWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type ScheduleTimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';

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
  /** 结构化游戏时间：可选多天，用于筛选 */
  schedule_weekday?: ScheduleWeekday[] | null;
  /** 结构化时间段：上午/下午/晚上/深夜，用于筛选 */
  schedule_time_slot?: ScheduleTimeSlot | null;
  /** 成团后对应战役是否允许旁观 */
  allow_ob?: boolean;
  description?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
  status: RecruitmentStatus;
  created_at: Date;
}

/** 申请状态（见产品设计 表2）
 * pending    已申请，待GM审核
 * invited    GM已通过，等待玩家24h内确认
 * confirmed  玩家已确认，已占席位
 * waiting    候补队列
 * rejected   申请被拒或超时未确认
 */
export type RecruitmentApplicationStatus = 'pending' | 'invited' | 'confirmed' | 'waiting' | 'rejected';

export interface RecruitmentApplication {
  id: string;
  post_id: string;
  applicant_user_id: string;
  character_id: string | null;
  message: string;
  status: RecruitmentApplicationStatus;
  reject_reason: string | null;
  invited_expires_at: Date | null;
  waiting_position: number | null;
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

/** 所有合法的招募帖状态（用于运行时校验） */
export const RECRUITMENT_STATUSES = [
  'draft', 'open', 'full', 'grouped', 'closed', 'dissolved', 'archived',
] as const satisfies ReadonlyArray<RecruitmentStatus>;

/** 所有合法的申请状态（用于运行时校验） */
export const RECRUITMENT_APP_STATUSES = [
  'pending', 'invited', 'confirmed', 'waiting', 'rejected',
] as const satisfies ReadonlyArray<RecruitmentApplicationStatus>;

/** 类型守卫：判断是否为合法 RecruitmentStatus */
export function isRecruitmentStatus(v: unknown): v is RecruitmentStatus {
  return typeof v === 'string' && (RECRUITMENT_STATUSES as readonly string[]).includes(v);
}

/** 类型守卫：判断是否为合法 RecruitmentApplicationStatus */
export function isRecruitmentAppStatus(v: unknown): v is RecruitmentApplicationStatus {
  return typeof v === 'string' && (RECRUITMENT_APP_STATUSES as readonly string[]).includes(v);
}

/** 判断招募帖是否处于"活跃接受申请"状态 */
export function isActiveRecruitment(status: RecruitmentStatus): boolean {
  return status === 'open' || status === 'full';
}

/** 判断申请是否处于"可操作"状态（非终态） */
export function isActiveApplication(status: RecruitmentApplicationStatus): boolean {
  return status === 'pending' || status === 'invited' || status === 'waiting';
}

// ===== 评价与信誉 =====

/** 跑团结束后 GM↔玩家双向评价 */
export interface CampaignReview {
  id: string;
  campaign_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: 'gm' | 'player';
  /** 星级 1~5 */
  rating: number;
  comment: string | null;
  created_at: Date;
}

/** 用户信誉汇总（滚动均值） */
export interface ReputationScore {
  user_id: string;
  /** 所有收到评价的平均星级（保留两位小数） */
  avg_rating: number;
  /** 总收到评价数 */
  total_reviews: number;
  /** 作为 GM 收到的评价数 */
  gm_reviews: number;
  /** 作为玩家收到的评价数 */
  player_reviews: number;
  updated_at: Date;
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
  /**
   * [旧字段，兼容保留] 直接存储的原子节点定义。
   * 新建规则集应使用 recipe_source；legacy 数据可继续使用此字段。
   */
  atoms: object;
  /**
   * [旧字段，兼容保留] 直接存储的连接定义。
   * 新建规则集应使用 recipe_source；legacy 数据可继续使用此字段。
   */
  connections: object;
  commands: object;
  character_card_schema: object;
  status: RulesetStatus;
  created_at: Date;

  // ===== Recipe 主线字段（新增）=====

  /**
   * 配方源码（编辑真源）。
   * 用户编辑 recipe_source，保存时服务端自动 compile，结果写入 compiled_graph。
   * 为空时表示该规则集是 legacy 格式（atoms/connections 直接存储）。
   */
  recipe_source?: import('./recipe').RulesetRecipeSource | null;

  /**
   * 编译产物缓存（由服务端 compile 自动生成，前端只读）。
   * 执行器优先读取此字段；不存在时回退到 atoms/connections。
   */
  compiled_graph?: import('./recipe').RulesetCompiledGraph | null;

  /**
   * Legacy 标记。true 表示该规则集来自旧 atoms/connections 格式，
   * 尚未完成 Recipe 迁移。
   */
  legacy?: boolean;

  /**
   * Legacy 元数据（仅 legacy=true 时有意义）。
   */
  legacy_meta?: import('./recipe').LegacyMeta | null;
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
    /** Recipe 主线（阶段3后写入） */
    recipe_source?: import('./recipe').RulesetRecipeSource | null;
    /** 编译产物缓存（阶段3后写入） */
    compiled_graph?: import('./recipe').RulesetCompiledGraph | null;
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
  /** GM 开启后玩家可拖拽自己的角色 Token（默认 false） */
  allow_player_token_drag: boolean;
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

// ===== 引擎错误码与告警码（§ 十六.5）=====

export type EngineErrorCode =
  | 'INTENT_PARSE_FAILED'
  | 'COMMAND_NOT_FOUND'
  | 'COMMAND_NOT_SUPPORTED'
  | 'PERMISSION_DENIED'
  | 'RUNTIME_MODIFIER_CONFLICT'
  | 'MODIFIER_OUT_OF_RANGE'
  | 'UNSUPPORTED_MODIFIER'
  | 'RECIPE_NOT_FOUND'
  | 'RECIPE_VALIDATION_FAILED'
  | 'UNKNOWN_RECIPE_TYPE'
  | 'MISSING_CHARACTER_DATA'
  | 'DSL_EVAL_ERROR'
  | 'DSL_NON_BOOLEAN_CONDITION'
  | 'EXPRESSION_TIMEOUT'
  | 'STEP_RESULT_UNAVAILABLE'
  | 'RESULT_COLLECT_FAILED'
  | 'VERSION_UNSUPPORTED'
  | 'INVALID_VERSION_FORMAT'
  | 'IMPORT_SCHEMA_INVALID'
  | 'IMPORT_RELATION_MISSING'
  | 'IMPORT_PERMISSION_DENIED'
  | 'IMPORT_RULESET_REQUIRED';

export type EngineWarningCode =
  | 'NO_TIER_MATCHED'
  | 'MODIFIER_IGNORED'
  | 'UNKNOWN_FIELDS_IGNORED'
  | 'MINOR_VERSION_DOWNLEVEL'
  | 'ROUNDTRIP_LOSSY';

export type FailedStage =
  | 'intent_parse'
  | 'command_match'
  | 'modifier_extract'
  | 'recipe_lookup'
  | 'context_load'
  | 'graph_execute'
  | 'result_collect'
  | 'compile'
  | 'validate'
  | 'import';

export interface EngineWarning {
  code: EngineWarningCode;
  message: string;
  field_path?: string;
}

/**
 * 运行时修饰符（规范化后，§ 十六③ ModifierExtract 阶段产物）
 * 未出现的字段保持 undefined，不设全局默认值。
 */
export interface NormalizedModifiers {
  bonus_dice?: number;       // 1–9，与 penalty_dice 互斥
  penalty_dice?: number;     // 1–9，与 bonus_dice 互斥
  difficulty_level?: number; // 0 起，越界时自动夹紧
  dc_override?: number;      // 覆盖目标值（优先于 target_bonus）
  target_bonus?: number;     // 叠加到目标值
  advantage?: boolean;       // 与 disadvantage 同时出现时相互抵消
  disadvantage?: boolean;
}

/**
 * execute 端点请求体（ruleset_id 已由路径参数 :id 承担，不出现在请求体）。
 * context 与 mock_context 二选一；两者同时存在时优先 mock_context。
 */
export interface ExecuteRequest {
  /** 完整命令字符串，e.g. "/rc 侦查 60" */
  command: string;
  /** 原始用户输入，用于日志溯源（等同于 command，可选冗余） */
  raw_text?: string;
  /** 命令参数（命令字符串无法解析时的备用，键名需与图节点输入键匹配） */
  params?: Record<string, unknown>;
  /** 规范化后的运行时修饰符（§ 十六③ 产物） */
  runtime_modifiers?: NormalizedModifiers;
  /** 真实角色上下文 */
  context?: {
    character_id: string;
    campaign_id: string;
    scene_id?: string;
    /** 调用者角色，用于权限判断 */
    caller_role?: 'gm' | 'player' | 'system';
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
  /** 节点执行状态（§ 十八.4） */
  status?: 'success' | 'skipped' | 'failed';
  error_code?: EngineErrorCode;
  error_message?: string;
}

/** execute 端点返回体（对齐 § 十六.4 ExecuteResponse） */
export interface ExecuteResponse {
  success: boolean;
  /** 可读的最终结果描述 */
  result: string;
  dice_rolls: Array<{ expression: string; value: number; detail: string }>;
  logs: NodeExecutionLog[];
  warnings: EngineWarning[];
  error?: string;
  /** 失败阶段（§ 十六 FailedStage） */
  failed_stage?: FailedStage;
  /** 结构化错误码 */
  error_code?: EngineErrorCode;
  /** graph_execute 阶段失败时指向失败节点；其他阶段为 null */
  failed_node_id?: string | null;
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
export * from './recipe';
