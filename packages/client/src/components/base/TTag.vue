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

.t-tag--default { background: #f1f5f9; color: #475569; }
.t-tag--primary { background: #dbeafe; color: #1d4ed8; }
.t-tag--success { background: #dcfce7; color: #15803d; }
.t-tag--warning { background: #fef9c3; color: #a16207; }
.t-tag--danger  { background: #fee2e2; color: #b91c1c; }

.t-tag__close { border: none; background: none; cursor: pointer; color: inherit; font-size: 14px; line-height: 1; padding: 0 0 0 2px; }
</style>
