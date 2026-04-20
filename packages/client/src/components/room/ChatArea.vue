<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import MessageItem from './MessageItem.vue';
import ChatInput from './ChatInput.vue';
import { useMessageStore } from '../../stores/message-store';
import { useAuthStore } from '../../stores/auth-store';
import { socketClient } from '../../socket/socket-client';

const props = defineProps<{
  prefillText?: string;
  isGm?: boolean;
  currentSceneType?: string;
  myCharacter?: { id: string; name: string; avatarUrl?: string } | null;
  roleplayableNpcs?: { id: string; name: string; avatarUrl?: string }[];
  authDisplayName?: string;
  selectedIdentityKey?: string;
  rulesetCommands?: Array<{ name: string; description: string; paramHint?: string }>;
}>();

const messageStore = useMessageStore();
const authStore = useAuthStore();
const listRef = ref<HTMLElement>();

watch(() => messageStore.currentMessages.length, async () => {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
});

function handleSend(content: string, messageType: string, senderIdentity?: string) {
  const tempId = uuidv4();
  messageStore.addPendingMessage(content, tempId, messageType);
  let senderIdentityLabel: string | undefined;
  if (senderIdentity?.startsWith('npc:')) {
    senderIdentityLabel = props.roleplayableNpcs?.find((npc) => `npc:${npc.id}` === senderIdentity)?.name;
  } else if (senderIdentity?.startsWith('char:')) {
    senderIdentityLabel = props.myCharacter?.name;
  } else if (senderIdentity === 'gm') {
    senderIdentityLabel = 'GM';
  } else if (senderIdentity === 'platform') {
    senderIdentityLabel = props.authDisplayName;
  }

  socketClient.sendMessage({
    content,
    message_type: messageType,
    metadata: {
      temp_id: tempId,
      sender_identity: senderIdentity,
      sender_identity_label: senderIdentityLabel,
    },
  });
}

function handleCommand(commandStr: string) {
  const tempId = uuidv4();
  messageStore.addPendingMessage(commandStr, tempId, 'dice');
  socketClient.sendMessage({
    content: commandStr,
    message_type: 'command',
    metadata: { temp_id: tempId },
  });
}

function handleRetry(tempId: string) {
  messageStore.retryMessage(tempId);
  const msg = messageStore.currentMessages.find(m => m._tempId === tempId);
  if (msg) {
    socketClient.sendMessage({ content: msg.content, message_type: msg.message_type, metadata: { temp_id: tempId } });
  }
}

onMounted(() => {
  socketClient.onNewMessage((msg) => messageStore.addServerMessage(msg));
  socketClient.onMissedMessages((data) => messageStore.addMissedMessages(data.messages));
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
});
</script>

<template>
  <div class="chat-area">
    <div ref="listRef" class="message-list">
      <div v-if="messageStore.currentMessages.length === 0" class="empty-chat">
        <p>暂无消息，开始对话吧</p>
      </div>
      <MessageItem
        v-for="msg in messageStore.currentMessages"
        :key="msg.id || msg._tempId"
        :message="msg"
        :is-own="msg.sender_user_id === authStore.userId"
        @retry="handleRetry"
      />
    </div>
    <ChatInput
      :prefill-text="props.prefillText"
      :is-gm="props.isGm"
      :current-scene-type="props.currentSceneType"
      :my-character="props.myCharacter"
      :roleplayable-npcs="props.roleplayableNpcs"
      :auth-display-name="props.authDisplayName"
      :selected-identity-key="props.selectedIdentityKey"
      :ruleset-commands="props.rulesetCommands"
      @send="handleSend"
      @command="handleCommand"
    />
  </div>
</template>

<style scoped>
.chat-area { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.message-list { flex: 1; overflow-y: auto; padding: var(--space-4); }
.empty-chat { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-8); }
</style>
