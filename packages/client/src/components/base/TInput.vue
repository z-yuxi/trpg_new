<script setup lang="ts">
const modelValue = defineModel<string>();
defineProps<{
  placeholder?: string;
  type?: 'text' | 'password' | 'number';
  disabled?: boolean;
  error?: string;
  prefix?: string;
}>();
</script>

<template>
  <div class="t-input-wrap" :class="{ 'has-error': error }">
    <span v-if="prefix" class="t-input__prefix">{{ prefix }}</span>
    <input
      v-model="modelValue"
      class="t-input"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      :disabled="disabled"
    />
    <span v-if="error" class="t-input__error">{{ error }}</span>
  </div>
</template>

<style scoped>
/* 按附录 B 3.3：focus 时 border 变 primary + primary-light 阴影 */
.t-input-wrap { display: flex; flex-direction: column; gap: var(--space-1); }

.t-input {
  height: 36px;
  padding: 0 var(--space-3);
  background: var(--surface-page);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-sm);
  font-family: var(--font-sans);
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.t-input::placeholder { color: var(--text-muted); }

.t-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

/* 夜间模式：输入框背景用卡片色，与页面背景区分 */
:root[data-theme='night'] .t-input {
  background: var(--surface-card);
}

.t-input:disabled { opacity: 0.5; cursor: not-allowed; }

.has-error .t-input {
  border-color: var(--color-danger);
}
.has-error .t-input:focus {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px var(--color-danger-bg);
}

.t-input__prefix { font-size: var(--text-sm); color: var(--text-secondary); }
.t-input__error  { font-size: var(--text-xs); color: var(--color-danger); }
</style>
