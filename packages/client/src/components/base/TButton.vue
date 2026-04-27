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
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}
.t-btn:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.t-btn:not(:disabled):hover { transform: scale(1.02); box-shadow: var(--shadow-sm); }
.t-btn:active:not(:disabled) { transform: scale(0.96); }
.t-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(91, 141, 184, 0.3);
}

/* 尺寸 — 附录 B 3.1 */
.t-btn--sm { height: 28px; padding: 0 var(--space-3); font-size: var(--text-xs); }
.t-btn--md { height: 36px; padding: 0 var(--space-4); }
.t-btn--lg { height: 44px; padding: 0 var(--space-6); font-size: var(--text-base); }

/* primary */
.t-btn--primary {
  background: #5B8DB8;
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.t-btn--primary:hover:not(:disabled) {
  background: #4A7A9F;
  transform: scale(1.02);
}
.t-btn--primary:not(:disabled):active { background: #3D6A8F; }

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
  transform: scale(1.02);
}

/* danger */
.t-btn--danger {
  background: var(--color-danger);
  color: var(--text-inverse);
  border: none;
  box-shadow: var(--shadow-sm);
}
.t-btn--danger:not(:disabled):hover {
  background: var(--color-danger-hover);
  transform: scale(1.02);
}

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
  transform: scale(1.02);
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
