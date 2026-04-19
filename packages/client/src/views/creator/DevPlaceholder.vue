<script setup lang="ts">
defineProps<{ title?: string }>();
</script>
<template>
  <div class="placeholder">
    <p class="ph-icon">🚧</p>
    <p class="ph-title">{{ title ?? '功能开发中' }}</p>
    <p class="ph-desc">该功能正在积极开发中，敬请期待</p>
  </div>
</template>
<style scoped>
.placeholder { text-align: center; padding: var(--space-16); }
.ph-icon { font-size: 48px; margin-bottom: var(--space-3); }
.ph-title { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-2); }
.ph-desc { font-size: var(--text-sm); color: var(--text-muted); }
</style>
