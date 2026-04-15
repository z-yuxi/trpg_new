import type { ChatMessage, StoryTime, CharacterInstance, SnowflakeId } from './index';

// ===== Server → Client 事件 =====
export interface ServerToClientEvents {
  new_message: (message: ChatMessage) => void;
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
  move_approved: (data: { move_id: string; execute_at: StoryTime }) => void;
  move_rejected: (data: { move_id: string; reason?: string }) => void;
  rate_limited: (data: { retry_after: number; message: string }) => void;
  missed_messages: (data: {
    messages: ChatMessage[];
    your_state: CharacterInstance;
    global_time: StoryTime;
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
    execute_at?: StoryTime;
  }) => void;
  gm_reject_move: (data: {
    move_id: string;
    reason?: string;
  }) => void;
  gm_advance_time: (data: {
    delta?: { days?: number; hours?: number; minutes?: number };
    custom_time?: StoryTime;
  }) => void;
}
