<script setup lang="ts">
import BottomNav from './BottomNav.vue';
import { useTheme } from '../composables/useTheme';
import SvgIcon from '../components/SvgIcon.vue';

const { currentTheme, toggleTheme } = useTheme();
</script>

<template>
  <div class="main-layout">
    <header class="top-bar">
      <span class="logo">TRPG</span>
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
