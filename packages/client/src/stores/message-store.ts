import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatMessage } from '@trpg/shared';

export type MessageSendStatus = 'pending' | 'sent' | 'failed';

export interface LocalMessage extends ChatMessage {
  _sendStatus: MessageSendStatus;
  _tempId: string;
  _retryCount: number;
}

export const useMessageStore = defineStore('messages', () => {
  const messagesByScene = ref<Map<string, LocalMessage[]>>(new Map());
  const currentSceneId = ref<string>('');

  const currentMessages = computed<LocalMessage[]>(() => {
    return messagesByScene.value.get(currentSceneId.value) ?? [];
  });

  function _getOrCreate(sceneId: string): LocalMessage[] {
    if (!messagesByScene.value.has(sceneId)) {
      messagesByScene.value.set(sceneId, []);
    }
    return messagesByScene.value.get(sceneId)!;
  }

  function addServerMessage(msg: ChatMessage): void {
    const sceneId = msg.scene_id ?? currentSceneId.value;
    const list = _getOrCreate(sceneId);
    // 避免重复
    if (list.some((m) => m.id === msg.id)) return;
    const local: LocalMessage = { ...msg, _sendStatus: 'sent', _tempId: '', _retryCount: 0 };
    list.push(local);
    // 按 id 排序（Snowflake 自然递增）
    list.sort((a, b) => (a.id > b.id ? 1 : -1));
    messagesByScene.value.set(sceneId, list);
  }

  function addPendingMessage(content: string, tempId: string, messageType?: string): void {
    const sceneId = currentSceneId.value;
    const list = _getOrCreate(sceneId);
    const now = new Date();
    const local: LocalMessage = {
      id: tempId,
      scene_id: sceneId,
      campaign_id: '',
      sender_user_id: '',
      sender_character_id: null,
      content,
      message_type: (messageType as any) ?? 'narrative',
      story_time: null,
      visible_to: null,
      client_timestamp: now.getTime(),
      created_at: now,
      metadata: null,
      _sendStatus: 'pending',
      _tempId: tempId,
      _retryCount: 0,
    };
    list.push(local);
    messagesByScene.value.set(sceneId, list);
  }

  function confirmMessage(tempId: string, serverMsg: ChatMessage): void {
    const sceneId = serverMsg.scene_id ?? currentSceneId.value;
    const list = _getOrCreate(sceneId);
    const idx = list.findIndex((m) => m._tempId === tempId);
    if (idx >= 0) {
      list.splice(idx, 1, { ...serverMsg, _sendStatus: 'sent', _tempId: tempId, _retryCount: 0 });
    } else {
      addServerMessage(serverMsg);
    }
  }

  function failMessage(tempId: string): void {
    for (const list of messagesByScene.value.values()) {
      const msg = list.find((m) => m._tempId === tempId);
      if (msg) {
        msg._sendStatus = 'failed';
        return;
      }
    }
  }

  function retryMessage(tempId: string): void {
    for (const list of messagesByScene.value.values()) {
      const msg = list.find((m) => m._tempId === tempId);
      if (msg) {
        msg._sendStatus = 'pending';
        msg._retryCount += 1;
        return;
      }
    }
  }

  function addMissedMessages(messages: ChatMessage[]): void {
    for (const msg of messages) {
      addServerMessage(msg);
    }
  }

  function setCurrentScene(sceneId: string): void {
    currentSceneId.value = sceneId;
    _getOrCreate(sceneId);
  }

  function clearScene(sceneId: string): void {
    messagesByScene.value.delete(sceneId);
  }

  return {
    messagesByScene,
    currentSceneId,
    currentMessages,
    addServerMessage,
    addPendingMessage,
    confirmMessage,
    failMessage,
    retryMessage,
    addMissedMessages,
    setCurrentScene,
    clearScene,
  };
});
