<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElTabs, ElTabPane, ElBadge, ElButton, ElEmpty, ElSkeleton } from 'element-plus';
import { socketClient } from '../../socket/socket-client';
import { api } from '../../utils/api';
import type { NotificationType, UserNotification } from '@trpg/shared';

type Tab = NotificationType | 'all';

const activeTab = ref<Tab>('all');
const notifications = ref<UserNotification[]>([]);
const total = ref(0);
const loading = ref(false);
const unreadCount = ref(0);

const tabs: { label: string; value: Tab; type?: NotificationType }[] = [
  { label: '全部', value: 'all' },
  { label: '系统', value: 'system', type: 'system' },
  { label: '交易', value: 'transaction', type: 'transaction' },
  { label: '社交', value: 'social', type: 'social' },
  { label: '审核', value: 'audit', type: 'audit' },
];

async function fetchNotifications() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: '1', limit: '50' });
    if (activeTab.value !== 'all') params.set('type', activeTab.value);
    const body = await api.get<{ data: UserNotification[]; total: number }>(`/notifications?${params}`);
    notifications.value = body.data;
    total.value = body.total;
  } catch {
    ElMessage.error('通知加载失败');
  } finally {
    loading.value = false;
  }
}

async function fetchUnreadCount() {
  try {
    const body = await api.get<{ count: number }>('/notifications/unread-count');
    unreadCount.value = body.count;
  } catch { /* ignore */ }
}

async function markAsRead(id: string) {
  try {
    await api.put(`/notifications/${id}/read`, {});
    const n = notifications.value.find(n => n.id === id);
    if (n) {
      n.is_read = true;
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    }
  } catch { /* ignore */ }
}

async function markAllAsRead() {
  const type = activeTab.value !== 'all' ? activeTab.value as NotificationType : undefined;
  const body: Record<string, string> = {};
  if (type) body['type'] = type;
  try {
    await api.put('/notifications/read-all', body);
    notifications.value.forEach(n => { n.is_read = true; });
    if (activeTab.value === 'all') unreadCount.value = 0;
    else await fetchUnreadCount();
    ElMessage.success('已全部标为已读');
  } catch { /* ignore */ }
}

function handleTabChange(tab: Tab) {
  activeTab.value = tab;
  fetchNotifications();
}

function formatTime(date: Date | string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString('zh-CN');
}

const hasUnread = computed(() => notifications.value.some(n => !n.is_read));

onMounted(async () => {
  await fetchUnreadCount();
  await fetchNotifications();

  // 实时接收新通知
  socketClient.connectUser();
  socketClient.onNotificationNew((n: UserNotification) => {
    notifications.value.unshift(n);
    unreadCount.value++;
  });
  socketClient.onUnreadCountChanged((data: { count: number }) => {
    unreadCount.value = data.count;
  });
});
</script>

<template>
  <div class="notification-list">
    <div class="list-header">
      <h2 class="page-title">消息通知</h2>
      <ElButton v-if="hasUnread" size="small" @click="markAllAsRead">全部标为已读</ElButton>
    </div>

    <div class="tabs-bar">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-btn"
        :class="{ active: activeTab === tab.value }"
        @click="handleTabChange(tab.value)"
      >
        <ElBadge v-if="tab.value === 'all' && unreadCount > 0" :value="unreadCount" :max="99">
          {{ tab.label }}
        </ElBadge>
        <template v-else>{{ tab.label }}</template>
      </button>
    </div>

    <ElSkeleton v-if="loading" :rows="4" animated />

    <ElEmpty v-else-if="notifications.length === 0" description="暂无通知" />

    <ul v-else class="noti-list">
      <li
        v-for="n in notifications"
        :key="n.id"
        class="noti-item"
        :class="{ unread: !n.is_read }"
        @click="markAsRead(n.id)"
      >
        <div class="noti-dot" v-if="!n.is_read" />
        <div class="noti-body">
          <div class="noti-title">{{ n.title }}</div>
          <div class="noti-content">{{ n.content }}</div>
          <div class="noti-time">{{ formatTime(n.created_at) }}</div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.notification-list {
  padding: var(--space-4);
  max-width: 640px;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}
.page-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-heading);
  margin: 0;
}
.tabs-bar {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}
.tab-btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--text-body);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: all 0.15s;
}
.tab-btn.active,
.tab-btn:hover {
  background: var(--color-primary);
  color: var(--btn-primary-text);
  border-color: var(--color-primary);
}
.noti-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.noti-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background 0.15s;
  background: var(--surface-base);
}
.noti-item.unread {
  background: var(--surface-hover);
  border-color: var(--border-active);
}
.noti-item:hover { background: var(--surface-hover); }
.noti-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  flex-shrink: 0;
  margin-top: 6px;
}
.noti-body { flex: 1; min-width: 0; }
.noti-title {
  font-weight: var(--font-semibold);
  font-size: var(--text-sm);
  color: var(--text-heading);
  margin-bottom: 2px;
}
.noti-content {
  font-size: var(--text-sm);
  color: var(--text-body);
  line-height: var(--leading-relaxed);
  margin-bottom: var(--space-1);
}
.noti-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
