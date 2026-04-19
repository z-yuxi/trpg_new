<script setup lang="ts">
import SvgIcon from './SvgIcon.vue';

defineProps<{
  title: string;
  content: string;
  theme: string;
  senderName?: string;
}>();
</script>

<template>
  <div class="clue-card" :class="`clue-theme-${theme}`">
    <div class="clue-header">
      <SvgIcon name="icon-scroll" :size="16" />
      <span class="clue-label">线索</span>
      <span v-if="senderName" class="clue-sender">来自 {{ senderName }}</span>
    </div>
    <div class="clue-title">{{ title }}</div>
    <div class="clue-content" :class="`text-art-${theme}`">
      {{ content }}
    </div>
  </div>
</template>

<style scoped>
.clue-card {
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  background: var(--color-card-bg);
  transition: box-shadow var(--transition-fast);
}
.clue-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.clue-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.clue-label { font-size: var(--text-xs); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; }
.clue-sender { margin-left: auto; font-size: var(--text-xs); color: var(--color-text-muted); }
.clue-title { font-weight: 600; font-size: var(--text-base); margin-bottom: var(--space-2); }
.clue-content { font-size: var(--text-sm); line-height: 1.6; }

/* 移动端：简化动画 */
@media (max-width: 768px) {
  .clue-card:hover { transform: none; }
}

/* 尊重系统无动画偏好 */
@media (prefers-reduced-motion: reduce) {
  .clue-card, .clue-card:hover { transition: none; transform: none; }
}
</style>
