<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';
import { useMessageStore } from '../stores/message-store';
import { useNotificationStore } from '../stores/notification-store';

const route = useRoute();
const messageStore = useMessageStore();
const notificationStore = useNotificationStore();

const campaignUnread = computed(() => Object.values(messageStore.unreadCounts).reduce((sum, count) => sum + count, 0));

const tabs = [
  { name: 'Home', label: '首页', icon: 'icon-room', path: '/' },
  { name: 'AssetLibrary', label: '资产库', icon: 'icon-ruleset', path: '/assets' },
  { name: 'MyCampaigns', label: '我的团', icon: 'icon-list', path: '/campaigns', badge: campaignUnread },
  { name: 'Community', label: '社区', icon: 'icon-recruit', path: '/community' },
  { name: 'Personal', label: '我的', icon: 'icon-settings', path: '/personal', badge: computed(() => notificationStore.unreadCount) },
];

function isActive(tab: { name: string; path: string }) {
  if (tab.path === '/') return route.path === '/';
  return route.path.startsWith(tab.path);
}
</script>

<template>
  <nav class="bottom-nav">
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.path"
      class="nav-item"
      :class="{ active: isActive(tab) }"
    >
      <span class="icon-wrap">
        <SvgIcon :name="tab.icon" :size="22" />
        <span v-if="tab.badge?.value" class="nav-badge">{{ tab.badge.value > 99 ? '99+' : tab.badge.value }}</span>
      </span>
      <span class="nav-label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  display: flex;
  height: 56px;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--color-card-bg);
  border-top: 1px solid var(--color-card-border);
  position: sticky;
  bottom: 0;
  z-index: 100;
}
.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 44px;
  text-decoration: none;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  transition: color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}
.nav-item.active { color: var(--color-accent); }
.icon-wrap { position: relative; display: inline-flex; }
.nav-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-danger);
  color: var(--text-inverse);
  font-size: 10px;
  line-height: 18px;
  font-weight: 700;
  text-align: center;
}

/* 桌面端隐藏底部导航 */
@media (min-width: 641px) {
  .bottom-nav { display: none; }
}
</style>
