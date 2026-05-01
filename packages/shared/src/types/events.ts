import type { ChatMessage, StoryTime, CharacterInstance, GridToken, GridOverlay, SnowflakeId } from './index';

// ===== 通知类型 =====

/** 细粒度通知类型（设计规格 I03） */
export type NotificationType =
  // 跑团类
  | 'apply_approved' | 'apply_rejected' | 'waitlist_promoted'
  | 'group_success' | 'group_dissolved'
  | 'move_approved' | 'move_rejected' | 'move_cancelled'
  | 'campaign_ended'
  // 社区类
  | 'comment_floor' | 'comment_reply' | 'at_mention'
  | 'post_featured' | 'feature_rejected'
  // 社区版模组类（§4.8）
  | 'module_claimed'               // 作者认领了你上传的社区版
  | 'module_claim_buffer_warning'  // 缓冲期最后24小时提醒（贡献者）
  | 'module_claim_action_needed'   // 新认领待处理（作者端）
  | 'module_claim_decision'        // 作者已决定保留/下架（贡献者）
  | 'module_claim_letter_received' // 作者收到致作者的信
  | 'module_claim_letter_replied'  // 申请者收到作者回复
  // 系统类
  | 'report_result' | 'system_announcement'
  | 'achievement_unlocked' | 'badge_earned'
  // 旧类型（向后兼容，勿新增）
  | 'system' | 'transaction' | 'social' | 'audit';

/** UI 筛选标签分类 */
export type NotificationCategory = 'trpg' | 'community' | 'system';

/** 各分类包含的通知类型 */
export const NOTIFICATION_CATEGORY_TYPES: Record<NotificationCategory, NotificationType[]> = {
  trpg: ['apply_approved', 'apply_rejected', 'waitlist_promoted', 'group_success', 'group_dissolved', 'move_approved', 'move_rejected', 'move_cancelled'],
  community: ['comment_floor', 'comment_reply', 'at_mention', 'post_featured', 'feature_rejected',
    'module_claimed', 'module_claim_buffer_warning', 'module_claim_action_needed',
    'module_claim_decision', 'module_claim_letter_received', 'module_claim_letter_replied'],
  system: ['report_result', 'system_announcement', 'achievement_unlocked', 'badge_earned', 'system', 'audit'],
};

export interface UserNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  created_at: Date;
}

// ===== Server → Client 事件 =====
export interface ServerToClientEvents {
  new_message: (message: ChatMessage) => void;
  time_tag_announced: (data: {
    time_label: string;          // HH:MM 格式
    message_id: string;          // 插入聊天流的消息ID
  }) => void;
  position_changed: (data: {
    character_id: string;
    from_scene_id: string;
    to_scene_id: string;
    move_type: 'scheduled' | 'force_move' | 'join' | 'leave';
  }) => void;
  character_state_sync: (snapshot: CharacterInstance) => void;
  move_approved: (data: { move_id: string; to_scene_id: string; from_scene_id: string | null }) => void;
  move_rejected: (data: { move_id: string; reason?: string }) => void;
  rate_limited: (data: { retry_after: number; message: string }) => void;
  missed_messages: (data: {
    messages: ChatMessage[];
    your_state: CharacterInstance;
    global_time: StoryTime;
    /** 断线时间过长，消息可能不完整，客户端应刷新完整状态 */
    incomplete?: boolean;
  }) => void;
  /** 通用错误提示，如权限校验失败 */
  error_message: (data: { message: string }) => void;
  notification_new: (notification: UserNotification) => void;
  unread_count_changed: (data: { count: number }) => void;
  grid_token_moved: (data: { campaign_id: string; scene_id: string; token: GridToken }) => void;
  grid_area_marked: (data: { campaign_id: string; scene_id: string; overlays: GridOverlay[] }) => void;
  /** GM 结束团后向所有参与者推送（在线用户立即收到反馈弹窗提示） */
  campaign_ended: (data: {
    campaign_id: string;
    campaign_name: string;
  }) => void;
  /** AI 异步任务进度推送（任务完成/失败时由 BullMQ Worker 推送给对应用户） */
  ai_task_update: (data: {
    task_id: string;
    status: 'queued' | 'success' | 'failed';
    result?: unknown;
    error?: string;
  }) => void;
}

// ===== Client → Server 事件 =====
export interface ClientToServerEvents {
  join_room: (data: {
    campaign_id: string;
    character_id: string;
    last_event_id?: SnowflakeId;
  }) => void;
  leave_room: () => void;
  subscribe_scene: (data: { scene_id: string }) => void;
  chat_message: (data: {
    content: string;
    temp_id: string;
    message_type?: string;
    visible_to?: string[];
    metadata?: Record<string, unknown>;
  }) => void;
  request_move: (data: {
    target_scene_id: string;
    travel_method?: 'walk' | 'bike' | 'drive';
  }) => void;
  gm_approve_move: (data: {
    move_id: string;
    story_arrival_time?: string;  // 可选：HH:MM 格式的剧情到达时间
  }) => void;
  gm_reject_move: (data: {
    move_id: string;
    reason?: string;
  }) => void;
  gm_announce_time: (data: {
    time_label: string;  // HH:MM 格式，如 "14:30"
  }) => void;
  grid_token_moved: (data: {
    campaign_id: string;
    scene_id: string;
    token: GridToken;
  }) => void;
  grid_area_marked: (data: { campaign_id: string; scene_id: string; overlays: GridOverlay[] }) => void;
}
