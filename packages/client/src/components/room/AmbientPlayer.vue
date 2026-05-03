<script setup lang="ts">
/**
 * AmbientPlayer — 房间氛围音效悬浮控件
 *
 * 依赖 useAmbientSound composable
 * 在 Room.vue 切换场景时通过 props.keywords 驱动
 */
import { watch } from 'vue';
import { useAmbientSound } from '../../composables/useAmbientSound';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps<{
  /** 当前场景的氛围关键词数组 */
  keywords: string[];
}>();

const {
  enabled,
  volume,
  isPlaying,
  currentLabel,
  setKeywords,
  setVolume,
  toggle,
} = useAmbientSound();

// 关键词变更时自动切换音效
watch(() => props.keywords, (kws) => {
  setKeywords(kws);
}, { immediate: true });

function onVolumeInput(e: Event) {
  setVolume(Number((e.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="ambient-player" :class="{ 'ambient-player--off': !enabled }">
    <!-- 主按钮：点击开关 -->
    <button
      class="ambient-btn"
      :title="enabled ? '关闭氛围音效' : '开启氛围音效'"
      :aria-pressed="enabled"
      @click="toggle"
    >
      <SvgIcon :name="enabled && isPlaying ? 'icon-volume' : 'icon-volume-off'" :size="16" />
      <span class="ambient-label">
        {{ enabled && currentLabel ? currentLabel : '氛围音效' }}
      </span>
      <span v-if="enabled && isPlaying" class="ambient-dot" aria-hidden="true" />
    </button>

    <!-- 音量滑块（仅启用时显示） -->
    <input
      v-if="enabled"
      type="range"
      class="ambient-volume"
      min="0"
      max="1"
      step="0.05"
      :value="volume"
      aria-label="音量"
      @input="onVolumeInput"
    />
  </div>
</template>

<style scoped>
.ambient-player {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 4px var(--space-3, 12px);
  background: var(--surface-card, #1e1e2e);
  border: 1px solid var(--border-default, #333);
  border-radius: var(--radius-full, 999px);
  font-size: var(--text-xs, 12px);
  user-select: none;
}

.ambient-player--off {
  opacity: 0.55;
}

.ambient-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: var(--text-secondary, #aaa);
  cursor: pointer;
  padding: 0;
  font-size: inherit;
  line-height: 1;
  transition: color 0.15s;
}

.ambient-btn:hover {
  color: var(--text-primary, #fff);
}

.ambient-label {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ambient-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary, #6366f1);
  animation: pulse 2s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}

.ambient-volume {
  width: 60px;
  height: 3px;
  accent-color: var(--color-primary, #6366f1);
  cursor: pointer;
}

/* 移动端隐藏滑块，保留开关 */
@media (max-width: 600px) {
  .ambient-volume { display: none; }
  .ambient-label  { display: none; }
}
</style>
