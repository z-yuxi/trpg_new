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
  gap: var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background var(--transition-fast), opacity var(--transition-fast);
}
.t-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.t-btn--sm { height: 28px; padding: 0 var(--space-3); font-size: var(--text-xs); }
.t-btn--md { height: 36px; padding: 0 var(--space-4); }
.t-btn--lg { height: 44px; padding: 0 var(--space-6); font-size: var(--text-base); }

.t-btn--primary { background: var(--color-accent); color: var(--color-text-inverse); }
.t-btn--primary:hover:not(:disabled) { background: var(--color-accent-hover); }

.t-btn--secondary { background: var(--color-card-bg); color: var(--color-text-primary); border: 1px solid var(--color-card-border); }
.t-btn--secondary:hover:not(:disabled) { background: var(--color-page-bg); }

.t-btn--danger { background: var(--color-danger); color: var(--color-text-inverse); }
.t-btn--danger:hover:not(:disabled) { opacity: 0.85; }

.t-btn--ghost { background: transparent; color: var(--color-accent); }
.t-btn--ghost:hover:not(:disabled) { background: rgba(59,130,246,0.08); }

.t-btn__spinner {
  width: 14px; height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
