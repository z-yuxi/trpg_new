<script setup lang="ts">
defineProps<{
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: boolean;
  hoverable?: boolean;
}>();
</script>

<template>
  <div
    class="t-card"
    :class="[`t-card--pad-${padding ?? 'md'}`, { 'has-shadow': shadow, 'is-hoverable': hoverable }]"
  >
    <slot />
  </div>
</template>

<style scoped>
.t-card {
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  transition: box-shadow var(--transition-fast);
}
.t-card--pad-none { padding: 0; }
.t-card--pad-sm  { padding: var(--space-3); }
.t-card--pad-md  { padding: var(--space-4); }
.t-card--pad-lg  { padding: var(--space-6); }
.has-shadow { box-shadow: var(--shadow-md); }
.is-hoverable:hover { box-shadow: var(--shadow-lg); }
</style>
