<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import SvgIcon from '../SvgIcon.vue';
import { listConversations, markConversationRead } from '../../api/messages';
import type { Conversation } from '../../api/messages';

const emit = defineEmits<{ (e: 'close'): void }>();

const router = useRouter();

const loading = ref(false);
const convs = ref<Conversation[]>([]);

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function avatarLetter(nickname: string): string {
  return (nickname || '?')[0].toUpperCase();
}

async function load() {
  loading.value = true;
  try {
    convs.value = (await listConversations()).slice(0, 8);
  } catch { /* ignore */ } finally {
    loading.value = false;
  }
}

async function openConv(conv: Conversation) {
  emit('close');
  if (conv.unread_count > 0) {
    markConversationRead(conv.id).catch(() => {});
    conv.unread_count = 0;
  }
  router.push(`/messages?conv=${conv.id}`);
}

function goAll() {
  router.push('/messages');
  emit('close');
}

onMounted(load);
</script>

<template>
  <div class="msg-panel" @click.stop>
    <div class="panel-header">
      <span class="panel-title">私信</span>
      <button class="view-all" @click="goAll">查看全部</button>
    </div>

    <div class="panel-body">
      <!-- 加载中 -->
      <div v-if="loading" class="empty-tip"><span>加载中...</span></div>

      <!-- 空状态 -->
      <div v-else-if="convs.length === 0" class="empty-tip">
        <SvgIcon name="icon-envelope" :size="32" class="empty-icon" />
        <span>暂无私信</span>
      </div>

      <!-- 会话列表 -->
      <ul v-else class="conv-list">
        <li
          v-for="c in convs"
          :key="c.id"
          class="conv-item"
          @click="openConv(c)"
        >
          <div class="conv-avatar">
            <img v-if="c.other_user.avatar_url" :src="c.other_user.avatar_url" :alt="c.other_user.nickname" />
            <span v-else class="avatar-letter">{{ avatarLetter(c.other_user.nickname) }}</span>
            <span v-if="c.unread_count > 0" class="badge">{{ c.unread_count > 99 ? '99+' : c.unread_count }}</span>
          </div>
          <div class="conv-main">
            <div class="conv-top">
              <span class="conv-name">{{ c.other_user.nickname }}</span>
              <span class="conv-time">{{ relativeTime(c.last_message_at) }}</span>
            </div>
            <div class="conv-preview">{{ c.last_message || '...' }}</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.msg-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: -8px;
  width: 320px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,.14);
  z-index: 300;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-card-border);
}
.panel-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
}
.view-all {
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  white-space: nowrap;
  border-radius: var(--radius-sm);
}
.view-all:hover { background: var(--color-primary-light); }
.panel-body {
  max-height: 360px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.empty-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  padding: var(--space-6) 0;
  min-height: 120px;
  justify-content: center;
}
.empty-icon { opacity: 0.3; }

/* 会话列表 */
.conv-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.conv-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  border-bottom: 1px solid var(--color-card-border);
  transition: background var(--transition-fast);
}
.conv-item:last-child { border-bottom: none; }
.conv-item:hover { background: var(--color-primary-light); }

.conv-avatar {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
}
.conv-avatar img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.avatar-letter {
  display: flex;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: var(--text-base);
  font-weight: 700;
  align-items: center;
  justify-content: center;
}
.badge {
  position: absolute;
  top: -2px;
  right: -2px;
  background: var(--color-danger, #e53e3e);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  border-radius: 999px;
  padding: 2px 4px;
  min-width: 16px;
  text-align: center;
}

.conv-main { flex: 1; min-width: 0; }
.conv-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.conv-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.conv-time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  flex-shrink: 0;
  white-space: nowrap;
}
.conv-preview {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 400px) {
  .msg-panel { right: -80px; width: 290px; }
}
</style>
