<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElBadge, ElButton, ElEmpty, ElSkeleton } from 'element-plus';
import SvgIcon from '../../components/SvgIcon.vue';
import { socketClient } from '../../socket/socket-client';
import { listNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount } from '../../api/notifications';
import type { UserNotification } from '@trpg/shared';
import { useRouter } from 'vue-router';
import { useNotificationStore } from '../../stores/notification-store';

type Category = 'all' | 'trpg' | 'community' | 'system';

const activeCategory = ref<Category>('all');
const notifications = ref<UserNotification[]>([]);
const total = ref(0);
const loading = ref(false);
const unreadCount = ref(0);
const router = useRouter();
const notifStore = useNotificationStore();

const tabs: { label: string; value: Category }[] = [
  { label: '全部', value: 'all' },
  { label: '跑团', value: 'trpg' },
  { label: '社区', value: 'community' },
  { label: '系统', value: 'system' },
];

/** 各分类跳转目标（点击通知时路由） */
const JUMP_MAP: Record<string, string> = {
  apply_approved: '/recruit',
  apply_rejected: '/recruit',
  waitlist_promoted: '/recruit',
  group_success: '/my-campaigns',
  group_dissolved: '/my-campaigns',
  move_approved: '/my-campaigns',
  move_rejected: '/my-campaigns',
  move_cancelled: '/my-campaigns',
  comment_floor: '/discuss',
  comment_reply: '/discuss',
  at_mention: '/discuss',
  post_featured: '/discuss',
  feature_rejected: '/discuss',
  achievement_unlocked: '/personal',
  badge_earned: '/personal',
};

async function fetchNotifications() {
  loading.value = true;
  try {
    const body = await listNotifications({ page: 1, limit: 50, ...(activeCategory.value !== 'all' ? { category: activeCategory.value } : {}) });
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
    const body = await getUnreadCount();
    unreadCount.value = body.count;
  } catch { /* ignore */ }
}

async function markAsRead(n: UserNotification) {
  if (!n.is_read) {
    await markNotificationRead(n.id).catch(() => {});
    n.is_read = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
    notifStore.setUnreadCount(Math.max(0, notifStore.unreadCount - 1));
  }
  // 跳转关联内容
  const target = JUMP_MAP[n.type] ?? null;
  if (n.metadata?.['url']) {
    router.push(String(n.metadata['url']));
  } else if (target) {
    router.push(target);
  }
}

async function markAllAsRead() {
  const body: Record<string, string> = {};
  if (activeCategory.value !== 'all') body['category'] = activeCategory.value;
  try {
    await markAllNotificationsRead(activeCategory.value !== 'all' ? { category: activeCategory.value } : {});
    notifications.value.forEach(n => { n.is_read = true; });
    if (activeCategory.value === 'all') {
      unreadCount.value = 0;
      notifStore.setUnreadCount(0);
    } else {
      await fetchUnreadCount();
      notifStore.fetchUnreadCount();
    }
    ElMessage.success('已全部标为已读');
  } catch { /* ignore */ }
}

function handleTabChange(cat: Category) {
  activeCategory.value = cat;
  fetchNotifications();
}

function formatTime(date: Date | string) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 172800000) return '昨天';
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/** 通知类型 → 中文标签 */
const TYPE_LABEL: Record<string, string> = {
  apply_approved: '招募通知', apply_rejected: '招募通知', waitlist_promoted: '招募通知',
  group_success: '成团通知', group_dissolved: '解散通知',
  move_approved: '移动通知', move_rejected: '移动通知', move_cancelled: '移动通知',
  comment_floor: '社区通知', comment_reply: '社区通知', at_mention: '@提及',
  post_featured: '精华通知', feature_rejected: '社区通知',
  report_result: '举报结果', system_announcement: '系统公告',
  achievement_unlocked: '成就', badge_earned: '勋章',
  system: '系统通知', transaction: '交易通知', social: '社区通知', audit: '审核通知',
};

const hasUnread = computed(() => notifications.value.some(n => !n.is_read));

const emptyText = computed(() =>
  activeCategory.value === 'all' ? '暂无通知' : '该分类下暂无通知'
);

onMounted(async () => {
  await fetchUnreadCount();
  await fetchNotifications();

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
      <h2 class="page-title">
        <SvgIcon name="icon-bell" :size="18" />
        <span>消息通知</span>
      </h2>
      <ElButton v-if="hasUnread" size="small" @click="markAllAsRead">全部标为已读</ElButton>
    </div>

    <div class="tabs-bar">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-btn"
        :class="{ active: activeCategory === tab.value }"
        @click="handleTabChange(tab.value)"
      >
        <ElBadge v-if="tab.value === 'all' && unreadCount > 0" :value="unreadCount" :max="99">
          {{ tab.label }}
        </ElBadge>
        <template v-else>{{ tab.label }}</template>
      </button>
    </div>

    <ElSkeleton v-if="loading" :rows="4" animated />

    <ElEmpty v-else-if="notifications.length === 0" :description="emptyText" />

    <ul v-else class="noti-list">
      <li
        v-for="n in notifications"
        :key="n.id"
        class="noti-item"
        :class="{ unread: !n.is_read }"
        @click="markAsRead(n)"
      >
        <div class="noti-dot" v-if="!n.is_read" />
        <div class="noti-body">
          <div class="noti-header-row">
            <span class="noti-tag">{{ TYPE_LABEL[n.type] ?? n.type }}</span>
            <span class="noti-time">{{ formatTime(n.created_at) }}</span>
          </div>
          <div class="noti-title">{{ n.title }}</div>
          <div class="noti-content">{{ n.content }}</div>
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
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
.noti-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.noti-tag {
  font-size: var(--text-xs);
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
}
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
}
.noti-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
