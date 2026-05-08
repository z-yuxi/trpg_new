<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';
import { useMessageStore } from '../stores/message-store';
import { useNotificationStore } from '../stores/notification-store';
import { useNavTabs } from './nav-config';

const route = useRoute();
const messageStore = useMessageStore();
const notificationStore = useNotificationStore();

const campaignUnread = computed(() =>
  Object.values(messageStore.unreadCounts).reduce((sum, count) => sum + count, 0),
);

const { tabs } = useNavTabs();

function getBadge(name: string): number {
  if (name === 'Rooms') return campaignUnread.value;
  if (name === 'Tuantu') return notificationStore.unreadCount;
  return 0;
}

function isActive(path: string) {
  if (path === '/') return route.path === '/';
  return route.path.startsWith(path);
}
</script>

<template>
  <nav class="bottom-nav">
    <router-link
      v-for="tab in tabs"
      :key="tab.name"
      :to="tab.path"
      class="nav-item"
      :class="{ active: isActive(tab.path) }"
    >
      <span class="icon-wrap">
        <SvgIcon :name="tab.icon" :size="22" />
        <span v-if="getBadge(tab.name) > 0" class="nav-badge">
          {{ getBadge(tab.name) > 99 ? '99+' : getBadge(tab.name) }}
        </span>
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
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
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
  transition: color var(--transition-fast), opacity 0.2s ease;
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
  background: var(--color-danger, #ef4444);
  color: #fff;
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
