<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import type { LocalMessage } from '../../stores/message-store';

const props = defineProps<{ message: LocalMessage; isOwn: boolean }>();
const emit = defineEmits<{ retry: [tempId: string] }>();

function formatTime(d: Date) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function parseDiceResult(metadata: any) {
  if (!metadata) return null;
  return metadata as { expression?: string; total?: number; details?: string };
}

function parseClue(metadata: any) {
  if (!metadata) return null;
  return metadata as { title?: string; content?: string; theme?: string };
}
</script>

<template>
  <!-- system -->
  <div v-if="message.message_type === 'system'" class="msg-system">{{ message.content }}</div>

  <!-- announcement -->
  <div v-else-if="message.message_type === 'announcement'" class="msg-announcement">
    <span>📢 {{ message.content }}</span>
  </div>

  <!-- dice -->
  <div v-else-if="message.message_type === 'dice'" class="msg-dice">
    <SvgIcon name="icon-dice" :size="16" />
    <span class="dice-expr">{{ parseDiceResult(message.metadata)?.expression }}</span>
    <span class="dice-eq">=</span>
    <span class="dice-total">{{ parseDiceResult(message.metadata)?.total }}</span>
    <span class="dice-detail">{{ parseDiceResult(message.metadata)?.details }}</span>
  </div>

  <!-- clue_card -->
  <div v-else-if="message.message_type === 'clue_card'" class="msg-clue">
    <div class="clue-header"><SvgIcon name="icon-scroll" :size="14" /> 线索</div>
    <div class="clue-title">{{ parseClue(message.metadata)?.title }}</div>
    <div class="clue-content" :class="`text-art-${parseClue(message.metadata)?.theme ?? 'default'}`">
      {{ message.content }}
    </div>
  </div>

  <!-- ooc -->
  <div v-else-if="message.message_type === 'ooc'" class="msg-ooc">
    [OOC] {{ message.content }}
  </div>

  <!-- narrative / default -->
  <div v-else class="msg-bubble-row" :class="{ own: isOwn }">
    <div class="msg-avatar">{{ (message.sender_character_id ?? message.sender_user_id ?? '?')[0] }}</div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble" :class="{ 'own-bubble': isOwn, 'failed': message._sendStatus === 'failed' }">
        {{ message.content }}
        <span v-if="message._sendStatus === 'pending'" class="send-status pending">⏳</span>
        <span
          v-else-if="message._sendStatus === 'failed'"
          class="send-status failed"
          @click="emit('retry', message._tempId)"
          title="点击重试"
        >❗</span>
      </div>
      <div class="msg-time">{{ formatTime(message.created_at) }}</div>
    </div>
  </div>
</template>

<style scoped>
.msg-system { text-align: center; font-size: var(--text-xs); color: var(--color-text-muted); padding: var(--space-1); }
.msg-announcement { background: #fef9c3; border: 1px solid #fbbf24; border-radius: var(--radius-md); padding: var(--space-3); font-weight: 500; margin: var(--space-2) 0; }
.msg-dice {
  display: flex; align-items: center; gap: var(--space-2);
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3); margin: var(--space-2) 0; font-family: var(--font-mono);
}
.dice-expr { color: var(--color-text-secondary); }
.dice-total { font-size: var(--text-lg); font-weight: 700; color: var(--color-accent); }
.dice-detail { font-size: var(--text-xs); color: var(--color-text-muted); }
.msg-clue { border: 1px solid var(--color-card-border); border-radius: var(--radius-lg); padding: var(--space-3); margin: var(--space-2) 0; background: var(--color-card-bg); }
.clue-header { display: flex; align-items: center; gap: var(--space-1); font-size: var(--text-xs); color: var(--color-text-muted); margin-bottom: var(--space-2); }
.clue-title { font-weight: 600; margin-bottom: var(--space-2); }
.clue-content { font-size: var(--text-sm); color: var(--color-text-secondary); }
.msg-ooc { font-style: italic; color: var(--color-text-muted); font-size: var(--text-sm); padding: 2px var(--space-2); }
.msg-bubble-row { display: flex; gap: var(--space-2); padding: var(--space-2) 0; }
.msg-bubble-row.own { flex-direction: row-reverse; }
.msg-avatar {
  width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
  background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); font-weight: 600;
}
.msg-bubble-wrap { max-width: 70%; }
.msg-bubble {
  padding: var(--space-2) var(--space-3);
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm); line-height: 1.6;
  word-break: break-word;
}
.msg-bubble.own-bubble { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.msg-bubble.failed { border-color: var(--color-danger); }
.msg-time { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 2px; }
.msg-bubble-row.own .msg-time { text-align: right; }
.send-status { margin-left: 4px; font-size: 11px; }
.send-status.failed { cursor: pointer; }
</style>
