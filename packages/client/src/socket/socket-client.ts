import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export class SocketClient {
  private roomSocket: TypedSocket | null = null;
  private userSocket: TypedSocket | null = null;
  private token: string = '';

  setToken(token: string): void {
    this.token = token;
  }

  connectRoom(): TypedSocket {
    if (this.roomSocket?.connected) return this.roomSocket;
    this.roomSocket = io('/room', {
      auth: { token: this.token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as TypedSocket;
    return this.roomSocket;
  }

  connectUser(): TypedSocket {
    if (this.userSocket?.connected) return this.userSocket;
    this.userSocket = io('/user', {
      auth: { token: this.token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as TypedSocket;
    return this.userSocket;
  }

  joinRoom(campaignId: string, characterId: string, lastEventId?: string): void {
    if (!this.roomSocket) this.connectRoom();
    this.roomSocket!.emit('join_room', { campaign_id: campaignId, character_id: characterId, last_event_id: lastEventId });
  }

  leaveRoom(): void {
    this.roomSocket?.emit('leave_room');
  }

  subscribeScene(sceneId: string): void {
    this.roomSocket?.emit('subscribe_scene', { scene_id: sceneId });
  }

  sendMessage(payload: {
    content: string;
    message_type?: string;
    visible_to?: string[];
    metadata?: Record<string, unknown>;
  }): void {
    this.roomSocket?.emit('chat_message', {
      content: payload.content,
      temp_id: Date.now().toString(),
      message_type: payload.message_type,
      visible_to: payload.visible_to,
      metadata: payload.metadata,
    });
  }

  requestMove(toSceneId: string): void {
    this.roomSocket?.emit('request_move', { target_scene_id: toSceneId });
  }

  gmAnnounceTime(timeLabel: string): void {
    this.roomSocket?.emit('gm_announce_time', { time_label: timeLabel });
  }

  gmApproveMove(moveId: string, storyArrivalTime?: string): void {
    this.roomSocket?.emit('gm_approve_move', { move_id: moveId, story_arrival_time: storyArrivalTime });
  }

  gmRejectMove(moveId: string): void {
    this.roomSocket?.emit('gm_reject_move', { move_id: moveId });
  }

  moveGridToken(campaignId: string, sceneId: string, token: { id: string; entity_type: 'character' | 'npc' | 'object'; entity_id: string; label: string; x: number; y: number; color: string }): void {
    this.roomSocket?.emit('grid_token_moved', {
      campaign_id: campaignId,
      scene_id: sceneId,
      token,
    });
  }

  onNewMessage(handler: (msg: any) => void): void {
    this.roomSocket?.on('new_message', handler);
  }

  onTimeTagAnnounced(handler: (data: any) => void): void {
    this.roomSocket?.on('time_tag_announced', handler);
  }

  onPositionChanged(handler: (data: any) => void): void {
    this.roomSocket?.on('position_changed', handler);
  }

  onCharacterStateSync(handler: (data: any) => void): void {
    this.roomSocket?.on('character_state_sync', handler);
  }

  onMoveApproved(handler: (data: any) => void): void {
    this.roomSocket?.on('move_approved', handler);
  }

  onMoveRejected(handler: (data: any) => void): void {
    this.roomSocket?.on('move_rejected', handler);
  }

  onRateLimited(handler: (data: any) => void): void {
    this.roomSocket?.on('rate_limited', handler);
  }

  onMissedMessages(handler: (data: any) => void): void {
    this.roomSocket?.on('missed_messages', handler);
  }

  onNotificationNew(handler: (notification: any) => void): void {
    this.userSocket?.on('notification_new', handler);
  }

  onUnreadCountChanged(handler: (data: { count: number }) => void): void {
    this.userSocket?.on('unread_count_changed', handler);
  }

  onGridTokenMoved(handler: (data: { campaign_id: string; scene_id: string; token: { id: string; entity_type: 'character' | 'npc' | 'object'; entity_id: string; label: string; x: number; y: number; color: string } }) => void): void {
    this.roomSocket?.on('grid_token_moved', handler);
  }

  markGridArea(campaignId: string, sceneId: string, overlays: Array<{ id: string; x: number; y: number; w: number; h: number; color: string; label?: string }>): void {
    this.roomSocket?.emit('grid_area_marked', {
      campaign_id: campaignId,
      scene_id: sceneId,
      overlays,
    });
  }

  onGridAreaMarked(handler: (data: { campaign_id: string; scene_id: string; overlays: Array<{ id: string; x: number; y: number; w: number; h: number; color: string; label?: string }> }) => void): void {
    this.roomSocket?.on('grid_area_marked', handler);
  }

  onAiTaskUpdate(handler: (data: { task_id: string; status: 'queued' | 'success' | 'failed'; result?: unknown; error?: string }) => void): void {
    this.userSocket?.on('ai_task_update', handler);
  }

  offAiTaskUpdate(): void {
    this.userSocket?.off('ai_task_update');
  }

  onCampaignEnded(handler: (data: { campaign_id: string; campaign_name: string }) => void): void {
    this.roomSocket?.on('campaign_ended', handler);
  }

  offCampaignEnded(): void {
    this.roomSocket?.off('campaign_ended');
  }

  disconnect(): void {
    this.roomSocket?.disconnect();
    this.userSocket?.disconnect();
    this.roomSocket = null;
    this.userSocket = null;
  }

  getRoomSocket(): TypedSocket | null {
    return this.roomSocket;
  }
}

export const socketClient = new SocketClient();
