<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import SvgIcon from '../SvgIcon.vue';
import { useAuthStore } from '../../stores/auth-store';
import { useIdentity } from '../../composables/useIdentity';
import { useTheme } from '../../composables/useTheme';

const emit = defineEmits<{ (e: 'close'): void }>();

const router = useRouter();
const auth = useAuthStore();
const { activeIdentity, isCreatorMode, switchIdentity } = useIdentity();
const { currentTheme, setTheme } = useTheme();

import type { ThemeMode } from '../../composables/useTheme';

const themes: { key: ThemeMode; label: string }[] = [
  { key: 'day',   label: '日间' },
  { key: 'night', label: '夜间' },
];

function navigate(path: string) {
  router.push(path);
  emit('close');
}

function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return;
  auth.logout();
  router.push('/login');
  emit('close');
}
</script>

<template>
  <div class="user-dropdown" @click.stop>
    <!-- 身份区 -->
    <div class="identity-section" @click="navigate('/tuantu')">
      <div class="identity-avatar">
        <img v-if="auth.avatarUrl" :src="auth.avatarUrl" alt="头像" />
        <SvgIcon v-else name="icon-user" :size="20" />
      </div>
      <div class="identity-info">
        <div class="identity-name">{{ auth.nickname ?? '用户' }}</div>
        <div class="identity-role">{{ isCreatorMode ? '创作者' : '玩家' }}</div>
      </div>
      <SvgIcon name="icon-chevron-right" :size="14" class="identity-arrow" />
    </div>

    <!-- 身份切换（仅创作者可见） -->
    <div v-if="auth.isCreator" class="identity-switch">
      <button
        class="switch-btn"
        :class="{ active: activeIdentity === 'player' }"
        @click="switchIdentity('player')"
      >玩家 / 主持人</button>
      <button
        class="switch-btn"
        :class="{ active: activeIdentity === 'creator' }"
        @click="switchIdentity('creator')"
      >创作者</button>
    </div>

    <div class="divider" />

    <!-- 快捷入口 -->
    <button class="menu-item" @click="navigate('/tuantu')">
      <SvgIcon name="icon-journey" :size="16" />
      <span>叙途</span>
    </button>
    <button class="menu-item" @click="navigate('/settings?section=content')">
      <SvgIcon name="icon-edit" :size="16" />
      <span>内容偏好</span>
    </button>

    <div class="divider" />

    <!-- 主题切换（内联三选一） -->
    <div class="theme-row">
      <SvgIcon :name="currentTheme === 'day' ? 'icon-sun' : 'icon-moon'" :size="16" />
      <span class="theme-label">主题</span>
      <div class="theme-options">
        <button
          v-for="t in themes"
          :key="t.key"
          class="theme-opt"
          :class="{ active: currentTheme === t.key }"
          @click="setTheme(t.key)"
        >{{ t.label }}</button>
      </div>
    </div>

    <button class="menu-item" @click="navigate('/settings')">
      <SvgIcon name="icon-settings" :size="16" />
      <span>设置</span>
    </button>

    <template v-if="auth.isAdmin">
      <div class="divider" />
      <button class="menu-item" @click="navigate('/admin')">
        <SvgIcon name="icon-npc" :size="16" />
        <span>管理后台</span>
      </button>
    </template>

    <div class="divider" />

    <button class="menu-item danger" @click="handleLogout">
      <SvgIcon name="icon-logout" :size="16" />
      <span>退出登录</span>
    </button>
  </div>
</template>

<style scoped>
.user-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 220px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,.14);
  z-index: 300;
  overflow: hidden;
  padding: var(--space-1) 0;
}

/* 身份区 */
.identity-section {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.identity-section:hover { background: var(--surface-hover); }
.identity-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-page-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.identity-avatar img { width: 100%; height: 100%; object-fit: cover; }
.identity-info { flex: 1; overflow: hidden; }
.identity-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.identity-role {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.identity-arrow { color: var(--color-text-muted); flex-shrink: 0; }

/* 身份切换 */
.identity-switch {
  display: flex;
  gap: var(--space-1);
  padding: 0 var(--space-3) var(--space-2);
}
.switch-btn {
  flex: 1;
  padding: var(--space-1) 0;
  font-size: var(--text-xs);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-card-border);
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.switch-btn.active {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  border-color: var(--color-accent);
}

/* 分割线 */
.divider {
  height: 1px;
  background: var(--color-card-border);
  margin: var(--space-1) 0;
}

/* 菜单项 */
.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  transition: background var(--transition-fast), color var(--transition-fast);
  text-align: left;
}
.menu-item:hover { background: var(--surface-hover); color: var(--color-text-primary); }
.menu-item.danger:hover { color: var(--color-error, #ef4444); }

/* 主题行 */
.theme-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
}
.theme-label { flex: 1; }
.theme-options {
  display: flex;
  gap: 2px;
}
.theme-opt {
  padding: 2px var(--space-2);
  font-size: 11px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-card-border);
  background: none;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.theme-opt.active {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  color: var(--color-accent);
  border-color: var(--color-accent);
}
</style>
