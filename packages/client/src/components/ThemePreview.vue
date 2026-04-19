<script setup lang="ts">
defineProps<{
  theme: string;
  text?: string;
}>();

const themeLabels: Record<string, string> = {
  river: '流水',
  blur: '模糊',
  fragment: '碎片',
  wave: '波浪',
  ancient: '古卷',
  blood: '血迹',
  ash: '灰烬',
  cyber: '赛博',
};
</script>

<template>
  <div class="theme-preview" :class="`clue-theme-${theme}`">
    <div class="preview-label">{{ themeLabels[theme] ?? theme }}</div>
    <div class="preview-text" :class="`text-art-${theme}`">
      <template v-if="theme === 'wave'">
        <span v-for="(ch, i) in (text ?? '预览文本')" :key="i">{{ ch }}</span>
      </template>
      <template v-else>{{ text ?? '预览文本' }}</template>
    </div>
  </div>
</template>

<style scoped>
.theme-preview {
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  background: var(--color-card-bg);
  min-width: 80px;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.theme-preview:hover { border-color: var(--color-accent); }
.preview-label {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-bottom: 4px;
  font-weight: 600;
  text-transform: uppercase;
}
.preview-text {
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.4;
}
</style>
