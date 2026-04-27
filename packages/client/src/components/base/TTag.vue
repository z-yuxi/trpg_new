<script setup lang="ts">
defineProps<{
  color?: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'danger';
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
/* 按附录 B 3.4：全部使用 CSS 变量，hover 时 primary-light 背景 */
.t-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--radius-sm);
  font-weight: var(--font-medium);
  white-space: nowrap;
  transition: background var(--transition-fast);
}
.t-tag--sm { padding: 2px 8px;  font-size: var(--text-xs); }
.t-tag--md { padding: 4px 10px; font-size: var(--text-sm); }

.t-tag--default {
  background: var(--color-tag-default-bg);
  color: var(--color-tag-default-text);
}
.t-tag--default:hover { background: var(--color-primary-light); color: var(--text-primary); }

.t-tag--primary {
  background: var(--color-primary-light);
  color: var(--text-primary);
}
.t-tag--primary:hover { opacity: 0.8; }

.t-tag--info {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.t-tag--success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.t-tag--warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.t-tag--danger {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.t-tag__close {
  border: none;
  background: none;
  cursor: pointer;
  color: inherit;
  font-size: 14px;
  line-height: 1;
  padding: 0 0 0 2px;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}
.t-tag__close:hover { opacity: 1; }
</style>
