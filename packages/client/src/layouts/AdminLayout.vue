<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const navItems = [
  { path: '/admin/dashboard',  icon: 'icon-npc',   label: '后台概览' },
  { path: '/admin/reports',    icon: 'icon-list',  label: '举报处理' },
  { path: '/admin/content',    icon: 'icon-book',  label: '内容审核' },
  { path: '/admin/reputation', icon: 'icon-star',  label: '信誉审计' },
  { path: '/admin/metrics',    icon: 'icon-dice',  label: '运营指标' },  { path: '/admin/ai',      icon: 'icon-sparkle', label: 'AI 监控' },];

function isActive(path: string) {
  return route.path.startsWith(path);
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>

<template>
  <div class="admin-layout">
    <aside class="admin-sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">管理后台</span>
        <RouterLink to="/" class="sidebar-back">← 返回主站</RouterLink>
      </div>
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
      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout">退出登录</button>
      </div>
    </aside>

    <main class="admin-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--surface-base, #f5f5f5);
}

.admin-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-default);
  background: var(--surface-card);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-header {
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-default);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sidebar-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.sidebar-back {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-decoration: none;
}

.sidebar-back:hover {
  color: var(--color-primary);
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3) var(--space-2);
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
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--color-primary-subtle);
  color: var(--color-primary);
  font-weight: 600;
}

.sidebar-footer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-default);
}

.logout-btn {
  width: 100%;
  padding: var(--space-2);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.logout-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.admin-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}
</style>
