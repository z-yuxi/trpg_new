<script setup lang="ts">
defineProps<{
  type?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
}>();
</script>

<template>
  <button
    class="t-btn"
    :class="[`t-btn--${type ?? 'primary'}`, `t-btn--${size ?? 'md'}`, { 'is-loading': loading }]"
    :disabled="disabled || loading"
  >
    <span v-if="loading" class="t-btn__spinner" />
    <slot />
  </button>
</template>

<style scoped>
.t-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  box-shadow: var(--shadow-xs);
  transition: background var(--transition-fast), transform var(--transition-fast), opacity var(--transition-fast), box-shadow var(--transition-fast);
}
.t-btn:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.t-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: var(--shadow-sm); }
.t-btn:not(:disabled):active { transform: scale(0.98); box-shadow: var(--shadow-xs); }

/* 尺寸 — 附录 B 3.1 */
.t-btn--sm { height: 28px; padding: 0 var(--space-3); font-size: var(--text-xs); }
.t-btn--md { height: 36px; padding: 0 var(--space-4); }
.t-btn--lg { height: 44px; padding: 0 var(--space-6); font-size: var(--text-base); }

/* primary — 日间深色/夜间浅色，自动反色 */
.t-btn--primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  box-shadow: var(--shadow-sm);
}
.t-btn--primary:not(:disabled):hover { background: var(--btn-primary-hover); box-shadow: var(--shadow-md); }
.t-btn--primary:not(:disabled):active { background: var(--color-primary-active); }

/* secondary */
.t-btn--secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  border: 1px solid var(--btn-secondary-border);
  box-shadow: none;
}
.t-btn--secondary:not(:disabled):hover {
  background: var(--surface-hover);
  border-color: var(--border-hover);
}

/* danger */
.t-btn--danger {
  background: var(--color-danger);
  color: var(--text-inverse);
  border: none;
  box-shadow: var(--shadow-sm);
}
.t-btn--danger:not(:disabled):hover { background: var(--red-700); }

/* ghost */
.t-btn--ghost {
  background: transparent;
  color: var(--text-body);
  border: 1px solid var(--border-default);
  box-shadow: none;
}
.t-btn--ghost:not(:disabled):hover {
  background: var(--color-primary-light);
  border-color: var(--border-hover);
}

.t-btn__spinner {
  width: 14px; height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
