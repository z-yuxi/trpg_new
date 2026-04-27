<script setup lang="ts">
defineProps<{
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: boolean;
  hoverable?: boolean;
  elevated?: boolean;
  status?: 'running' | 'preparing' | 'paused' | 'ended';
}>();
</script>

<template>
  <div
    class="t-card"
    :class="[
      `t-card--pad-${padding ?? 'md'}`,
      {
        'has-shadow': shadow,
        'is-hoverable': hoverable,
        'is-elevated': elevated,
      },
      status ? `t-card--status-${status}` : '',
    ]"
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

/* ===== hoverable 增强交互 ===== */
.is-hoverable {
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.is-hoverable:hover {
  border-color: var(--border-hover);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(16, 24, 40, 0.12);
}

.is-hoverable:active {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 2px 4px rgba(16, 24, 40, 0.1);
}

.is-hoverable:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(91, 141, 184, 0.3);
}

/* ===== elevated 浮起态 ===== */
.is-elevated {
  box-shadow: 0 4px 12px rgba(16, 24, 40, 0.12);
  transform: translateY(-2px);
}

/* ===== 状态视觉差异 ===== */
.t-card--status-running {
  border-left: 3px solid #6B8E6B;
  box-shadow: 0 4px 12px rgba(16, 24, 40, 0.1);
}

.t-card--status-preparing {
  border-left: 3px dashed #C9A227;
}

.t-card--status-paused {
  border-left: 3px dashed #98A2B3;
  opacity: 0.75;
  box-shadow: none;
}

.t-card--status-ended {
  border-left: 3px solid #98A2B3;
  opacity: 0.65;
  filter: saturate(0.7);
  box-shadow: none;
}
</style>
