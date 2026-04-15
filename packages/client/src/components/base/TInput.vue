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
.t-input-wrap { display: flex; flex-direction: column; gap: var(--space-1); }
.t-input {
  height: 36px;
  padding: 0 var(--space-3);
  background: var(--color-input-bg);
  border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}
.t-input:focus { border-color: var(--color-input-focus); }
.t-input:disabled { opacity: 0.5; cursor: not-allowed; }
.has-error .t-input { border-color: var(--color-danger); }
.t-input__prefix { font-size: var(--text-sm); color: var(--color-text-secondary); }
.t-input__error { font-size: var(--text-xs); color: var(--color-danger); }
</style>
