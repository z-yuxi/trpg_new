<script setup lang="ts">
defineProps<{
  width?: string;
  height?: string;
  variant?: 'text' | 'circle' | 'rect';
  animated?: boolean;
}>();
</script>

<template>
  <span
    class="t-skeleton"
    :class="[`t-skeleton--${variant ?? 'rect'}`, { 'is-animated': animated !== false }]"
    :style="{ width: width ?? '100%', height: height ?? '16px' }"
  />
</template>

<style scoped>
.t-skeleton {
  display: inline-block;
  background: #e5e7eb;
  border-radius: var(--radius-sm);
}
.t-skeleton--circle { border-radius: 50%; }
.t-skeleton--text { border-radius: var(--radius-full); height: 14px; }
.is-animated {
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease infinite;
}
@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
