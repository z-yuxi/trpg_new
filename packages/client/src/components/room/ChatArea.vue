<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted, onUnmounted } from 'vue';
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
const scrollTop = ref(0);
const viewportHeight = ref(0);
const estimatedItemSize = 88;
const overscan = 10;

const useVirtualList = computed(() => messageStore.currentMessages.length > 200);
const startIndex = computed(() => {
  if (!useVirtualList.value) return 0;
  return Math.max(0, Math.floor(scrollTop.value / estimatedItemSize) - overscan);
});
const endIndex = computed(() => {
  if (!useVirtualList.value) return messageStore.currentMessages.length;
  const visibleCount = Math.ceil(viewportHeight.value / estimatedItemSize) + overscan * 2;
  return Math.min(messageStore.currentMessages.length, startIndex.value + visibleCount);
});
const visibleMessages = computed(() => {
  if (!useVirtualList.value) return messageStore.currentMessages;
  return messageStore.currentMessages.slice(startIndex.value, endIndex.value);
});
const topSpacer = computed(() => useVirtualList.value ? startIndex.value * estimatedItemSize : 0);
const bottomSpacer = computed(() => useVirtualList.value
  ? Math.max(0, (messageStore.currentMessages.length - endIndex.value) * estimatedItemSize)
  : 0);

function syncViewportHeight() {
  viewportHeight.value = listRef.value?.clientHeight ?? 0;
}

function scrollToBottom(force = false) {
  if (!listRef.value) return;
  const nearBottom = listRef.value.scrollHeight - listRef.value.scrollTop - listRef.value.clientHeight < 120;
  if (force || nearBottom) {
    listRef.value.scrollTop = listRef.value.scrollHeight;
  }
}

function handleScroll() {
  scrollTop.value = listRef.value?.scrollTop ?? 0;
}

watch(() => messageStore.currentMessages.length, async () => {
  const shouldAutoScroll = !listRef.value || listRef.value.scrollHeight - listRef.value.scrollTop - listRef.value.clientHeight < 120;
  await nextTick();
  syncViewportHeight();
  if (shouldAutoScroll) scrollToBottom(true);
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
  syncViewportHeight();
  scrollToBottom(true);
  window.addEventListener('resize', syncViewportHeight);
});

onUnmounted(() => {
  window.removeEventListener('resize', syncViewportHeight);
});
</script>

<template>
  <div class="chat-area">
    <div ref="listRef" class="message-list" @scroll="handleScroll">
      <div v-if="messageStore.currentMessages.length === 0" class="empty-chat">
        <p>暂无消息，开始对话吧</p>
      </div>
      <template v-else>
        <div v-if="topSpacer" :style="{ height: `${topSpacer}px` }" aria-hidden="true"></div>
        <MessageItem
          v-for="msg in visibleMessages"
          :key="msg.id || msg._tempId"
          :message="msg"
          :is-own="msg.sender_user_id === authStore.userId"
          @retry="handleRetry"
        />
        <div v-if="bottomSpacer" :style="{ height: `${bottomSpacer}px` }" aria-hidden="true"></div>
      </template>
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
.message-list { flex: 1; overflow-y: auto; padding: var(--space-4); contain: layout paint; }
.empty-chat { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-8); }

@media (max-width: 768px) {
  .message-list {
    padding: var(--space-3);
  }
}
</style>
