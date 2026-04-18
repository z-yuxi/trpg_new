<script setup lang="ts">
defineProps<{
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  closable?: boolean;
}>();
defineEmits<{ close: [] }>();
</script>

<template>
  <span class="t-tag" :class="[`t-tag--${color ?? 'default'}`, `t-tag--${size ?? 'md'}`]">
    <slot />
    <button v-if="closable" class="t-tag__close" @click="$emit('close')">×</button>
  </span>
</template>

<style scoped>
.t-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius-full);
  font-weight: 500;
  white-space: nowrap;
}
.t-tag--sm { padding: 2px 8px; font-size: var(--text-xs); }
.t-tag--md { padding: 4px 10px; font-size: var(--text-sm); }

.t-tag--default { background: var(--color-tag-default-bg); color: var(--color-tag-default-text); }
.t-tag--primary { background: var(--color-primary-light); color: var(--color-accent); }
.t-tag--success { background: var(--color-success-bg); color: var(--color-success); }
.t-tag--warning { background: var(--color-warning-bg); color: var(--color-warning); }
.t-tag--danger  { background: var(--color-danger-bg); color: var(--color-danger); }

.t-tag__close { border: none; background: none; cursor: pointer; color: inherit; font-size: 14px; line-height: 1; padding: 0 0 0 2px; }
</style>
