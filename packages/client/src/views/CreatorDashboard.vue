<script setup lang="ts">
import { useRoute } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';

const route = useRoute();

const navItems = [
  { path: '/creator/dashboard',  icon: 'icon-npc',       label: '创作者专区' },
  { path: '/creator/workshop',   icon: 'icon-list',      label: '规则工坊' },
  { path: '/creator/modules',    icon: 'icon-book',      label: '模组编辑器' },
  { path: '/creator/assets',     icon: 'icon-dice',      label: '素材库' },
  { path: '/creator/products',   icon: 'icon-star',      label: '我的作品' },
];

function isActive(path: string) {
  return route.path.startsWith(path);
}
</script>

<template>
  <div class="creator-layout">
    <!-- 左侧导航 -->
    <aside class="creator-sidebar">
      <div class="sidebar-title">创作者专区</div>
      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: isActive(item.path) }"
        >
          <SvgIcon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <!-- 主内容区 -->
    <main class="creator-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.creator-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.creator-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-default);
  background: var(--surface-card);
  display: flex;
  flex-direction: column;
  padding: var(--space-4) 0;
  overflow-y: auto;
}

.sidebar-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 var(--space-4) var(--space-3);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 var(--space-2);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--text-sm);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.nav-item:hover { background: var(--surface-hover); color: var(--text-primary); }
.nav-item.active { background: color-mix(in srgb, var(--color-accent) 12%, transparent); color: var(--color-accent); font-weight: 500; }

.creator-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

@media (max-width: 768px) {
  .creator-sidebar { width: 100%; height: auto; border-right: none; border-bottom: 1px solid var(--border-default); flex-direction: row; padding: var(--space-2); }
  .creator-layout { flex-direction: column; }
  .sidebar-nav { flex-direction: row; gap: var(--space-1); }
  .sidebar-title { display: none; }
  .nav-item { padding: var(--space-1) var(--space-2); }
}
</style>
