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
/* 按附录 B 3.2：12px 圆角、shadow-sm 默认、hover 时 shadow-md + translateY(-2px) */
.t-card {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);   /* 12px */
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-normal), transform var(--transition-normal), border-color var(--transition-normal);
}
.t-card--pad-none { padding: 0; }
.t-card--pad-sm  { padding: var(--space-3); }
.t-card--pad-md  { padding: var(--space-5); }  /* 20px */
.t-card--pad-lg  { padding: var(--space-6); }

.has-shadow { box-shadow: var(--shadow-md); }

.is-hoverable:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
</style>
