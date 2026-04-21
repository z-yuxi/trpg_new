import type { ChatMessage, StoryTime, CharacterInstance, GridToken, GridOverlay, SnowflakeId } from './index';

// ===== 通知类型 =====
export type NotificationType = 'system' | 'transaction' | 'social' | 'audit';

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
  /** @deprecated 旧事件，保留兼容性 */
  time_advanced: (data: {
    old_time: StoryTime;
    new_time: StoryTime;
    triggered_moves: { move_id: string; character_id: string; to_scene_id: string }[];
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
  }) => void;
  notification_new: (notification: UserNotification) => void;
  unread_count_changed: (data: { count: number }) => void;
  grid_token_moved: (data: { campaign_id: string; scene_id: string; token: GridToken }) => void;
  grid_area_marked: (data: { campaign_id: string; scene_id: string; overlays: GridOverlay[] }) => void;
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
