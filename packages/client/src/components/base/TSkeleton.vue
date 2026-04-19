<script setup lang="ts">
withDefaults(defineProps<{
  width?: string;
  height?: string;
  variant?: 'text' | 'circle' | 'rect';
  animated?: boolean;
  /** 预设骨架屏布局类型 */
  type?: 'card' | 'list' | 'text';
  /** list/text 类型的行数 */
  rows?: number;
}>(), {
  rows: 3,
});
</script>

<template>
  <!-- 预设：card 骨架屏 -->
  <div v-if="type === 'card'" class="sk-card">
    <span class="t-skeleton t-skeleton--rect is-animated sk-card-img" />
    <div class="sk-card-body">
      <span class="t-skeleton t-skeleton--text is-animated" style="width: 60%; height: 16px" />
      <span class="t-skeleton t-skeleton--text is-animated" style="width: 90%; height: 13px; margin-top: 8px" />
      <span class="t-skeleton t-skeleton--text is-animated" style="width: 75%; height: 13px; margin-top: 6px" />
    </div>
  </div>

  <!-- 预设：list 骨架屏 -->
  <div v-else-if="type === 'list'" class="sk-list">
    <div v-for="i in rows" :key="i" class="sk-list-item">
      <span class="t-skeleton t-skeleton--circle is-animated" style="width: 36px; height: 36px; flex-shrink: 0" />
      <div class="sk-list-lines">
        <span class="t-skeleton t-skeleton--text is-animated" style="width: 50%; height: 14px" />
        <span class="t-skeleton t-skeleton--text is-animated" style="width: 80%; height: 12px; margin-top: 6px" />
      </div>
    </div>
  </div>

  <!-- 预设：text 骨架屏 -->
  <div v-else-if="type === 'text'" class="sk-text">
    <span
      v-for="i in rows"
      :key="i"
      class="t-skeleton t-skeleton--text is-animated"
      :style="{ width: i === rows ? '65%' : '100%', height: '14px', marginTop: i === 1 ? '0' : '8px' }"
    />
  </div>

  <!-- 单块骨架 -->
  <span
    v-else
    class="t-skeleton"
    :class="[`t-skeleton--${variant ?? 'rect'}`, { 'is-animated': animated !== false }]"
    :style="{ width: width ?? '100%', height: height ?? '16px' }"
  />
</template>

<style scoped>
.t-skeleton {
  display: inline-block;
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
}
.t-skeleton--circle { border-radius: 50%; }
.t-skeleton--text { border-radius: var(--radius-full); height: 14px; }
.is-animated {
  background: linear-gradient(90deg, var(--surface-hover) 25%, var(--surface-card) 50%, var(--surface-hover) 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease infinite;
}
@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .is-animated { animation: none; background: var(--surface-hover); }
}

/* card layout */
.sk-card { display: flex; flex-direction: column; gap: 0; border-radius: var(--radius-lg); overflow: hidden; }
.sk-card-img { width: 100%; height: 140px; display: block; border-radius: 0; }
.sk-card-body { padding: var(--space-3); display: flex; flex-direction: column; }

/* list layout */
.sk-list { display: flex; flex-direction: column; gap: var(--space-3); }
.sk-list-item { display: flex; align-items: center; gap: var(--space-3); }
.sk-list-lines { flex: 1; display: flex; flex-direction: column; }

/* text layout */
.sk-text { display: flex; flex-direction: column; }
</style>

