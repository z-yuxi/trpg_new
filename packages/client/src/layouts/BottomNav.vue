<script setup lang="ts">
import { useRoute } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';

const route = useRoute();

const tabs = [
  { name: 'Home', label: '首页', icon: 'icon-room', path: '/' },
  { name: 'AssetLibrary', label: '广场', icon: 'icon-ruleset', path: '/assets' },
  { name: 'MyCampaigns', label: '房间大厅', icon: 'icon-list', path: '/campaigns' },
  { name: 'Community', label: '社区', icon: 'icon-recruit', path: '/community' },
  { name: 'Personal', label: '我的', icon: 'icon-settings', path: '/personal' },
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
      <SvgIcon :name="tab.icon" :size="22" />
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

/* 桌面端隐藏底部导航 */
@media (min-width: 769px) {
  .bottom-nav { display: none; }
}
</style>
