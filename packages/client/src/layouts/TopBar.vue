<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';
import NotificationPanel from '../components/shell/NotificationPanel.vue';
import MessagePanel from '../components/shell/MessagePanel.vue';
import UserDropdown from '../components/shell/UserDropdown.vue';
import { useNotificationStore } from '../stores/notification-store';
import { useMessageStore } from '../stores/message-store';
import { useAuthStore } from '../stores/auth-store';
import { shouldShowBackButton } from '../composables/usePageInteractionPolicy';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const notifStore = useNotificationStore();
const messageStore = useMessageStore();

const pageTitle = () => (route?.meta?.title as string) ?? '';
const canGoBack = () => shouldShowBackButton(route);

const messageUnread = () =>
  Object.values(messageStore.unreadCounts).reduce((s, c) => s + c, 0);

/** 桌面端导航项（中间动态项随身份切换） */
const desktopNavItems = computed(() => [
  { label: '探索', path: '/explore' },
  { label: '招募', path: '/recruit' },
  auth.activeIdentity === 'creator' && auth.isCreator
    ? { label: '创作台', path: '/creator' }
    : { label: '房间', path: '/rooms' },
  { label: '讨论', path: '/discuss' },
  { label: '叙途', path: '/tuantu' },
]);

// ── 弹窗状态（互斥：同时只开一个）───────────────────────────────────────────
const openPanel = ref<'notif' | 'msg' | 'user' | null>(null);

function togglePanel(name: 'notif' | 'msg' | 'user') {
  openPanel.value = openPanel.value === name ? null : name;
}

function closeAll() {
  openPanel.value = null;
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.topbar-action')) {
    closeAll();
  }
}

function handleBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/');
}

onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
  notifStore.fetchUnreadCount?.();
});
onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick);
});
</script>

<template>
  <header class="top-bar">
    <!-- 移动端顶栏 -->
    <div class="mobile-header">
      <button v-if="canGoBack()" class="icon-btn" @click="handleBack" aria-label="返回">
        <SvgIcon name="icon-back" :size="20" />
      </button>
      <span v-else class="logo" @click="router.push('/')" style="cursor:pointer">TRPG</span>
      <span class="page-title">{{ pageTitle() }}</span>

      <!-- 右侧：铃铛 + 信封 + 头像▼ -->
      <div class="topbar-actions">
        <!-- 铃铛 -->
        <div class="topbar-action" @click.stop="togglePanel('notif')">
          <button class="icon-btn" aria-label="通知">
            <SvgIcon name="icon-bell" :size="20" />
            <span v-if="notifStore.unreadCount > 0" class="icon-dot" />
          </button>
          <Transition name="panel">
            <NotificationPanel v-if="openPanel === 'notif'" @close="closeAll" />
          </Transition>
        </div>

        <!-- 信封 -->
        <div class="topbar-action" @click.stop="togglePanel('msg')">
          <button class="icon-btn" aria-label="私信">
            <SvgIcon name="icon-envelope" :size="20" />
            <span v-if="messageUnread() > 0" class="icon-dot" />
          </button>
          <Transition name="panel">
            <MessagePanel v-if="openPanel === 'msg'" @close="closeAll" />
          </Transition>
        </div>

        <!-- 头像▼ -->
        <div v-if="auth.isLoggedIn" class="topbar-action avatar-action" @click.stop="togglePanel('user')">
          <button class="avatar-btn" :class="{ open: openPanel === 'user' }" aria-label="个人菜单">
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="avatar-img" alt="头像" />
            <SvgIcon v-else name="icon-user" :size="20" />
          </button>
          <Transition name="panel">
            <UserDropdown v-if="openPanel === 'user'" @close="closeAll" />
          </Transition>
        </div>
        <router-link v-else to="/login" class="login-link">登录</router-link>
      </div>
    </div>

    <!-- 桌面端顶栏 -->
    <div class="desktop-header">
      <span class="logo" @click="router.push('/')" style="cursor:pointer">TRPG</span>
      <nav class="desktop-nav">
        <router-link
          v-for="item in desktopNavItems"
          :key="item.path"
          :to="item.path"
          class="desktop-nav-item"
          :class="{ active: route.path.startsWith(item.path) }"
        >{{ item.label }}</router-link>
      </nav>

      <div class="desktop-actions">
        <!-- 铃铛 -->
        <div class="topbar-action" @click.stop="togglePanel('notif')">
          <button class="icon-btn" aria-label="通知">
            <SvgIcon name="icon-bell" :size="20" />
            <span v-if="notifStore.unreadCount > 0" class="icon-dot" />
          </button>
          <Transition name="panel">
            <NotificationPanel v-if="openPanel === 'notif'" @close="closeAll" />
          </Transition>
        </div>

        <!-- 信封 -->
        <div class="topbar-action" @click.stop="togglePanel('msg')">
          <button class="icon-btn" aria-label="私信">
            <SvgIcon name="icon-envelope" :size="20" />
            <span v-if="messageUnread() > 0" class="icon-dot" />
          </button>
          <Transition name="panel">
            <MessagePanel v-if="openPanel === 'msg'" @close="closeAll" />
          </Transition>
        </div>

        <!-- 头像▼ -->
        <div v-if="auth.isLoggedIn" class="topbar-action avatar-action" @click.stop="togglePanel('user')">
          <button class="avatar-btn" :class="{ open: openPanel === 'user' }" aria-label="个人菜单">
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl" class="avatar-img" alt="头像" />
            <SvgIcon v-else name="icon-user" :size="20" />
          </button>
          <Transition name="panel">
            <UserDropdown v-if="openPanel === 'user'" @close="closeAll" />
          </Transition>
        </div>
        <router-link v-else to="/login" class="login-link">登录</router-link>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  height: var(--navbar-height, 56px);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-card-border);
  position: sticky;
  top: 0;
  z-index: 200;
}

/* ── 移动端 ── */
.mobile-header {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--space-1);
}
.desktop-header { display: none; width: 100%; }

@media (min-width: 769px) {
  .mobile-header { display: none; }
  .desktop-header {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    width: 100%;
  }
}

/* ── Logo ── */
.logo {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: 2px;
  flex-shrink: 0;
}
.page-title {
  flex: 1;
  text-align: center;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 var(--space-1);
}

/* ── 桌面导航 ── */
.desktop-nav {
  display: flex;
  gap: var(--space-1);
  flex: 1;
}
.desktop-nav-item {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.desktop-nav-item:hover { color: var(--color-text-primary); background: var(--surface-hover); }
.desktop-nav-item.active { color: var(--color-accent); font-weight: 700; }

/* ── 右侧操作区 ── */
.topbar-actions,
.desktop-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  margin-left: auto;
}

/* ── 单个入口包装（定位弹窗用） ── */
.topbar-action {
  position: relative;
}

/* ── 图标按钮 ── */
.icon-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  transition: color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}
.icon-btn:hover { color: var(--color-accent); }

/* 小红点 */
.icon-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-error, #ef4444);
  border: 2px solid var(--color-card-bg);
  pointer-events: none;
}

/* ── 头像按钮 ── */
.avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-page-bg);
  color: var(--color-text-secondary);
  border: 2px solid transparent;
  transition: border-color var(--transition-fast);
  cursor: pointer;
  overflow: hidden;
}
.avatar-btn.open,
.avatar-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

/* ── 登录链接 ── */
.login-link {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-accent);
  text-decoration: none;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-accent);
  transition: background var(--transition-fast);
}
.login-link:hover { background: color-mix(in srgb, var(--color-accent) 10%, transparent); }

/* ── 面板过渡动画 ── */
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 768px) {
  .top-bar { padding: 0 var(--space-3); }
}
</style>
