<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import SvgIcon from '../SvgIcon.vue';
import { useNotificationStore } from '../../stores/notification-store';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/notifications';
import type { Notification } from '../../api/notifications';

const emit = defineEmits<{ (e: 'close'): void }>();

const router = useRouter();
const notifStore = useNotificationStore();

const loading = ref(false);
const items = ref<Notification[]>([]);

const JUMP_MAP: Record<string, string> = {
  apply_approved: '/recruit',
  apply_rejected: '/recruit',
  waitlist_promoted: '/recruit',
  group_success: '/rooms',
  group_dissolved: '/rooms',
  move_approved: '/rooms',
  move_rejected: '/rooms',
  comment_floor: '/discuss',
  comment_reply: '/discuss',
  at_mention: '/discuss',
  post_featured: '/discuss',
  achievement_unlocked: '/tuantu',
  badge_earned: '/tuantu',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

async function load() {
  loading.value = true;
  try {
    const res = await listNotifications({ limit: 8, page: 1 });
    items.value = res.data;
  } catch { /* ignore */ } finally {
    loading.value = false;
  }
}

async function handleClick(n: Notification) {
  if (!n.is_read) {
    await markNotificationRead(n.id).catch(() => {});
    n.is_read = true;
    notifStore.setUnreadCount(Math.max(0, notifStore.unreadCount - 1));
  }
  const url = n.metadata?.['url'] ? String(n.metadata['url']) : (JUMP_MAP[n.type] ?? null);
  emit('close');
  if (url) router.push(url);
}

async function markAll() {
  await markAllNotificationsRead().catch(() => {});
  items.value.forEach(n => (n.is_read = true));
  notifStore.setUnreadCount(0);
}

function goAll() {
  router.push('/notifications');
  emit('close');
}

onMounted(load);
</script>

<template>
  <div class="notif-panel" @click.stop>
    <div class="panel-header">
      <span class="panel-title">通知</span>
      <div class="panel-actions">
        <button v-if="notifStore.unreadCount > 0" class="mark-all" @click="markAll">全部已读</button>
        <button class="view-all" @click="goAll">查看全部</button>
      </div>
    </div>

    <div class="panel-body">
      <!-- 加载中 -->
      <div v-if="loading" class="empty-tip"><span>加载中...</span></div>

      <!-- 空状态 -->
      <div v-else-if="items.length === 0" class="empty-tip">
        <SvgIcon name="icon-bell" :size="32" class="empty-icon" />
        <span>暂无通知</span>
      </div>

      <!-- 列表 -->
      <ul v-else class="notif-list">
        <li
          v-for="n in items"
          :key="n.id"
          class="notif-item"
          :class="{ unread: !n.is_read }"
          @click="handleClick(n)"
        >
          <span v-if="!n.is_read" class="unread-dot" />
          <div class="notif-content">
            <div class="notif-title">{{ n.title }}</div>
            <div class="notif-body">{{ n.body }}</div>
          </div>
          <span class="notif-time">{{ relativeTime(n.created_at) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.notif-panel {
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
.panel-actions {
  display: flex;
  gap: var(--space-2);
}
.mark-all, .view-all {
  font-size: var(--text-xs);
  color: var(--color-accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  white-space: nowrap;
  border-radius: var(--radius-sm);
}
.mark-all:hover, .view-all:hover {
  background: var(--color-primary-light);
}
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

/* 通知列表 */
.notif-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.notif-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  border-bottom: 1px solid var(--color-card-border);
  transition: background var(--transition-fast);
}
.notif-item:last-child { border-bottom: none; }
.notif-item:hover { background: var(--color-primary-light); }
.notif-item.unread { background: color-mix(in srgb, var(--color-primary) 5%, var(--color-card-bg)); }
.unread-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
  margin-top: 6px;
}
.notif-content { flex: 1; min-width: 0; }
.notif-title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notif-body {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notif-time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  flex-shrink: 0;
  white-space: nowrap;
  padding-top: 2px;
}

@media (max-width: 400px) {
  .notif-panel { right: -60px; width: 290px; }
}
</style>
