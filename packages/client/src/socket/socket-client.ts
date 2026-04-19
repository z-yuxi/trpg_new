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

  gmAdvanceTime(params: { custom_time?: { day: number; hour: number; minute: number }; delta?: { days?: number; hours?: number; minutes?: number } }): void {
    this.roomSocket?.emit('gm_advance_time', params);
  }

  gmApproveMove(moveId: string): void {
    this.roomSocket?.emit('gm_approve_move', { move_id: moveId });
  }

  gmRejectMove(moveId: string): void {
    this.roomSocket?.emit('gm_reject_move', { move_id: moveId });
  }

  onNewMessage(handler: (msg: any) => void): void {
    this.roomSocket?.on('new_message', handler);
  }

  onTimeAdvanced(handler: (data: any) => void): void {
    this.roomSocket?.on('time_advanced', handler);
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
