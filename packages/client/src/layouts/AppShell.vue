<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from './TopBar.vue';
import BottomNav from './BottomNav.vue';

const route = useRoute();

/** Landing 页和独立路由不显示底部导航 */
const showBottomNav = computed(() =>
  route.name !== 'Landing' && route.meta?.isPrimaryTab !== false
    ? true
    : !!route.meta?.isPrimaryTab,
);
</script>

<template>
  <div class="app-shell">
    <TopBar />
    <main class="shell-content">
      <router-view />
    </main>
    <BottomNav v-if="showBottomNav" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-page-bg);
}

.shell-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  /* 为底部导航预留空间 */
  padding-bottom: calc(var(--space-4) + 56px + env(safe-area-inset-bottom, 0px));
}

@media (min-width: 769px) {
  .shell-content {
    padding-bottom: var(--space-4);
  }
}
</style>
