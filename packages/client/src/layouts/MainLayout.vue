<script setup lang="ts">
import { computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import BottomNav from './BottomNav.vue';
import { useTheme } from '../composables/useTheme';
import SvgIcon from '../components/SvgIcon.vue';

const { currentTheme, toggleTheme } = useTheme();
const router = useRouter();
const route = useRoute();

const pageTitle = computed(() => (route.meta.title as string) ?? '');
const canGoBack = computed(() => route.path !== '/');

const desktopNavItems = [
  { label: '首页', path: '/' },
  { label: '广场', path: '/assets' },
  { label: '战役大厅', path: '/campaigns' },
  { label: '社区', path: '/community' },
];

function isNavActive(path: string) {
  if (path === '/') return route.path === '/';
  return route.path.startsWith(path);
}

function handleBack() {
  if (window.history.length > 1) { router.back(); return; }
  router.push('/');
}
</script>

<template>
  <div class="main-layout">
    <header class="top-bar">
      <!-- 手机端: 返回键 + 页面标题 + 主题切换 -->
      <div class="mobile-header">
        <button v-if="canGoBack" class="icon-btn" @click="handleBack" aria-label="返回">
          <SvgIcon name="icon-back" :size="20" />
        </button>
        <span v-else class="logo">TRPG</span>
        <span class="page-title">{{ pageTitle }}</span>
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
          <button class="icon-btn theme-toggle" @click="toggleTheme" aria-label="切换主题">
            <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
          </button>
          <router-link to="/personal" class="avatar-btn" aria-label="个人中心">
            <SvgIcon name="icon-settings" :size="20" />
          </router-link>
        </div>
      </div>
    </header>

    <main class="content">
      <router-view />
    </main>
    <BottomNav />
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
.avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-page-bg);
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: color var(--transition-fast);
}
.avatar-btn:hover { color: var(--color-accent); }
.content {
  flex: 1;
  padding: var(--space-4);
  overflow-y: auto;
}
</style>

<template>
  <div class="main-layout">
    <header class="top-bar">
      <button v-if="canGoBack" class="back-btn" @click="handleBack" aria-label="返回">
        <SvgIcon name="icon-back" :size="20" />
      </button>
      <span v-else class="logo">TRPG</span>
      <span class="page-title">{{ pageTitle }}</span>
      <button class="theme-toggle" @click="toggleTheme" aria-label="切换主题">
        <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="20" />
      </button>
    </header>
    <main class="content">
      <router-view />
    </main>
    <BottomNav />
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
  justify-content: space-between;
  padding: 0 var(--space-4);
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-card-border);
  position: sticky;
  top: 0;
  z-index: 100;
}
.logo {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-accent);
  letter-spacing: 2px;
}
.page-title {
  flex: 1;
  text-align: center;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text-primary);
}
.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
}
.back-btn:hover { color: var(--color-accent); }
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--color-page-bg);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: color var(--transition-fast), background var(--transition-fast);
}
.theme-toggle:hover { color: var(--color-accent); }
.content {
  flex: 1;
  padding: var(--space-4);
  overflow-y: auto;
}
</style>
