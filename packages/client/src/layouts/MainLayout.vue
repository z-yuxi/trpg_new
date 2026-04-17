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
</script>

<template>
  <div class="main-layout">
    <header class="top-bar">
      <button v-if="canGoBack" class="back-btn" @click="router.back()" aria-label="返回">
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
