<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import BottomNav from './BottomNav.vue';
import { useTheme } from '../composables/useTheme';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';
import { useNotificationStore } from '../stores/notification-store';

const { currentTheme, toggleTheme } = useTheme();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const notifStore = useNotificationStore();

const currentPath = computed(() => route?.path ?? '/');
const pageTitle = computed(() => (route?.meta?.title as string) ?? '');
const canGoBack = computed(() => currentPath.value !== '/');
const showCreatorEntry = computed(() => authStore.isLoggedIn && authStore.isCreator);
const isInCreator = computed(() => currentPath.value.startsWith('/creator'));

const desktopNavItems = [
  { label: '探索', path: '/explore' },
  { label: '招募', path: '/recruit' },
  { label: '房间', path: '/rooms' },
  { label: '讨论', path: '/discuss' },
];

function isNavActive(path: string) {
  if (path === '/') return currentPath.value === '/';
  return currentPath.value.startsWith(path);
}

function handleBack() {
  if (window.history.length > 1) {
    router?.back();
    return;
  }
  router?.push('/');
}

// ===== 头像下拉卡片 =====
const dropdownOpen = ref(false);

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value;
}

function closeDropdown() {
  dropdownOpen.value = false;
}

function navigateTo(path: string) {
  router.push(path);
  closeDropdown();
}

function handleLogout() {
  if (!confirm('确定要退出登录吗？')) return;
  authStore.logout?.();
  router.push('/login');
  closeDropdown();
}

function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest('.avatar-wrapper')) {
    closeDropdown();
  }
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
  <div class="main-layout">
    <header class="top-bar">
      <!-- 手机端: 返回键 + 页面标题 + 创作台图标(创作者) + 主题切换 -->
      <div class="mobile-header">
        <button v-if="canGoBack" class="icon-btn" @click="handleBack" aria-label="返回">
          <SvgIcon name="icon-back" :size="20" />
        </button>
        <span v-else class="logo">TRPG</span>
        <span class="page-title">{{ pageTitle }}</span>
        <router-link
          v-if="showCreatorEntry"
          to="/creator"
          class="icon-btn creator-entry-btn"
          :class="{ active: isInCreator }"
          aria-label="创作台"
        >
          <SvgIcon name="icon-workshop" :size="20" />
        </router-link>
        <button class="icon-btn theme-toggle" @click="toggleTheme" aria-label="切换主题">
          <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
        </button>
      </div>

      <!-- 桌面端: logo + 导航链接 + 个人入口 -->
      <div class="desktop-header">
        <span class="logo" @click="router.push('/')" style="cursor:pointer">TRPG</span>
        <nav class="desktop-nav">
          <router-link
            v-for="item in desktopNavItems"
            :key="item.path"
            :to="item.path"
            class="desktop-nav-item"
            :class="{ active: isNavActive(item.path) }"
          >{{ item.label }}</router-link>
        </nav>
        <div class="desktop-actions">
          <router-link
            v-if="showCreatorEntry"
            to="/creator"
            class="creator-tab-btn"
            :class="{ active: isInCreator }"
            aria-label="创作台"
          >创作台</router-link>
          <button class="icon-btn theme-toggle" @click="toggleTheme" aria-label="切换主题">
            <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
          </button>
          <!-- 头像 + 下拉卡片 -->
          <div class="avatar-wrapper" @click.stop="toggleDropdown">
            <div class="avatar-btn" :class="{ open: dropdownOpen }" aria-label="个人菜单">
              <img
                v-if="authStore.avatarUrl"
                :src="authStore.avatarUrl"
                class="avatar-img"
                alt="头像"
              />
              <SvgIcon v-else name="icon-user" :size="20" />
              <span
                v-if="notifStore.unreadCount > 0"
                class="avatar-badge"
                :aria-label="`${notifStore.unreadCount}条未读通知`"
              />
            </div>

            <!-- 下拉卡片 -->
            <Transition name="dropdown">
              <div v-if="dropdownOpen" class="dropdown-card" @click.stop>
                <!-- 用户信息行 -->
                <div class="dropdown-user" @click="navigateTo('/tuantu')">
                  <div class="dropdown-avatar">
                    <img v-if="authStore.avatarUrl" :src="authStore.avatarUrl" alt="头像" />
                    <SvgIcon v-else name="icon-user" :size="20" />
                  </div>
                  <div class="dropdown-name">{{ authStore.nickname ?? '用户' }}</div>
                </div>
                <div class="dropdown-divider" />
                <!-- 功能菜单 -->
                <button class="dropdown-item" @click="navigateTo('/notifications')">
                  <SvgIcon name="icon-bell" :size="16" />
                  <span>通知</span>
                  <span v-if="notifStore.unreadCount > 0" class="item-badge">{{ notifStore.unreadCount > 99 ? '99+' : notifStore.unreadCount }}</span>
                </button>
                <button class="dropdown-item" @click="navigateTo('/messages')">
                  <SvgIcon name="icon-chat" :size="16" />
                  <span>私信</span>
                </button>
                <button class="dropdown-item" @click="navigateTo('/settings')">
                  <SvgIcon name="icon-settings" :size="16" />
                  <span>设置</span>
                </button>
                <div class="dropdown-divider" />
                <button class="dropdown-item danger" @click="handleLogout">
                  <SvgIcon name="icon-logout" :size="16" />
                  <span>退出登录</span>
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </header>

    <main class="content">
      <router-view />
    </main>
    <BottomNav v-if="route.name !== 'Home'" />
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-page-bg);
}
.top-bar {
  height: var(--navbar-height);
  display: flex;
  align-items: center;
  padding: 0 var(--space-4);
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-card-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

/* 手机布局 */
.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.desktop-header { display: none; width: 100%; }

/* 桌面布局 */
@media (min-width: 769px) {
  .mobile-header { display: none; }
  .desktop-header {
    display: flex;
    align-items: center;
    gap: var(--space-6);
  }
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
  .desktop-actions { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
}

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
  padding: 0 var(--space-2);
}
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
  transition: color var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}
.icon-btn:hover { color: var(--color-accent); }
.theme-toggle { background: var(--color-page-bg); }

/* ===== 头像下拉卡片 ===== */
.avatar-wrapper {
  position: relative;
  cursor: pointer;
  user-select: none;
}
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
  position: relative;
}
.avatar-btn.open,
.avatar-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.avatar-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-error, #ef4444);
  border: 2px solid var(--color-card-bg);
}

.dropdown-card {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 200px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0,0,0,.12);
  z-index: 200;
  overflow: hidden;
  padding: var(--space-1) 0;
}
.dropdown-user {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.dropdown-user:hover { background: var(--surface-hover); }
.dropdown-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-page-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dropdown-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.dropdown-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dropdown-divider {
  height: 1px;
  background: var(--color-card-border);
  margin: var(--space-1) 0;
}
.dropdown-item {
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
.dropdown-item:hover { background: var(--surface-hover); color: var(--color-text-primary); }
.dropdown-item.danger:hover { color: var(--color-error, #ef4444); }
.item-badge {
  margin-left: auto;
  background: var(--color-error, #ef4444);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 9999px;
  padding: 1px 5px;
  min-width: 18px;
  text-align: center;
}
/* 过渡动画 */
.dropdown-enter-active, .dropdown-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.dropdown-enter-from, .dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 桌面端"创作台"模式切换按钮 */
.creator-tab-btn {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-secondary);
  text-decoration: none;
  border: 1px solid var(--color-card-border);
  background: none;
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
}
.creator-tab-btn:hover { color: var(--color-accent); border-color: var(--color-accent); }
.creator-tab-btn.active {
  color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
  border-color: var(--color-accent);
  font-weight: 700;
}

/* 移动端顶栏创作台图标 */
.creator-entry-btn {
  color: var(--color-text-secondary);
  text-decoration: none;
}
.creator-entry-btn.active { color: var(--color-accent); }

.content {
  flex: 1;
  padding: var(--space-4);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .top-bar {
    padding: 0 var(--space-3);
  }

  .logo {
    font-size: var(--text-lg);
    letter-spacing: 1px;
  }

  .content {
    padding: var(--space-3);
    padding-bottom: calc(var(--space-3) + var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px));
  }
}
</style>

