<template>
  <!-- 停靠模式：渲染在右侧边栏内 -->
  <div v-if="docked" class="fp-docked">
    <div class="fp-docked__header">
      <span
        class="fp-drag-handle"
        title="拖出为浮动窗"
        @mousedown="onDragHandleMousedown"
      >⠿</span>
      <span class="fp-title">{{ title }}</span>
      <button class="fp-btn" title="最小化" @click="emit('close')">✕</button>
    </div>
    <div class="fp-docked__body">
      <slot />
    </div>
  </div>

  <!-- 浮动模式：Portal 到 body，自由定位 -->
  <Teleport to="body">
    <div
      v-if="!docked"
      class="fp-float"
      :style="floatStyle"
      :class="{ 'fp-float--minimized': minimized }"
    >
      <div
        class="fp-float__header"
        @mousedown="onHeaderMousedown"
      >
        <span class="fp-drag-handle">⠿</span>
        <span class="fp-title">{{ title }}</span>
        <button class="fp-btn" title="最小化" @click="minimized = !minimized">{{ minimized ? '□' : '_' }}</button>
        <button class="fp-btn" title="收回侧边栏" @click="emit('dock')">⇥</button>
        <button class="fp-btn" title="关闭" @click="emit('close')">✕</button>
      </div>
      <div v-if="!minimized" class="fp-float__body">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

interface Props {
  title: string;
  docked: boolean;
  initialX?: number;
  initialY?: number;
  width?: number;
}

interface Emits {
  (e: 'undock'): void;
  (e: 'dock'): void;
  (e: 'close'): void;
}

const props = withDefaults(defineProps<Props>(), {
  initialX: undefined,
  initialY: undefined,
  width: 280,
});

const emit = defineEmits<Emits>();

const minimized = ref(false);

// 浮动窗口位置
const posX = ref(props.initialX ?? window.innerWidth - props.width - 24);
const posY = ref(props.initialY ?? 80);

const floatStyle = computed(() => ({
  left: `${posX.value}px`,
  top: `${posY.value}px`,
  width: `${props.width}px`,
}));

// ── 浮动窗拖拽 ────────────────────────────────────────────
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let startPosX = 0;
let startPosY = 0;

function onHeaderMousedown(e: MouseEvent) {
  // 不处理按钮点击
  if ((e.target as HTMLElement).tagName === 'BUTTON') return;
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  startPosX = posX.value;
  startPosY = posY.value;
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e: MouseEvent) {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  posX.value = Math.max(0, Math.min(window.innerWidth - props.width, startPosX + dx));
  posY.value = Math.max(0, Math.min(window.innerHeight - 60, startPosY + dy));
  snapToEdge();
}

function onDragEnd() {
  dragging = false;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
}

// 边缘吸附
const SNAP_THRESHOLD = 40;
function snapToEdge() {
  if (posX.value < SNAP_THRESHOLD) posX.value = 0;
  if (posY.value < SNAP_THRESHOLD) posY.value = 0;
  if (posX.value > window.innerWidth - props.width - SNAP_THRESHOLD) posX.value = window.innerWidth - props.width;
  if (posY.value > window.innerHeight - 200 - SNAP_THRESHOLD) posY.value = window.innerHeight - 200;
}

// ── 停靠时拖出触发 undock ────────────────────────────────
let dockDragStartX = 0;

function onDragHandleMousedown(e: MouseEvent) {
  dockDragStartX = e.clientX;
  document.addEventListener('mousemove', onDockDragMove);
  document.addEventListener('mouseup', onDockDragEnd);
}

function onDockDragMove(e: MouseEvent) {
  const dx = e.clientX - dockDragStartX;
  // 向左拖动超过 40px 触发 undock
  if (dx < -40) {
    onDockDragEnd();
    posX.value = Math.max(0, e.clientX - props.width / 2);
    posY.value = Math.max(0, e.clientY - 20);
    emit('undock');
  }
}

function onDockDragEnd() {
  document.removeEventListener('mousemove', onDockDragMove);
  document.removeEventListener('mouseup', onDockDragEnd);
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('mousemove', onDockDragMove);
  document.removeEventListener('mouseup', onDockDragEnd);
});
</script>

<style scoped>
/* ── 停靠模式 ───────────────────────────────────────── */
.fp-docked {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.fp-docked__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-card);
  flex-shrink: 0;
}

.fp-docked__body {
  flex: 1;
  overflow-y: auto;
}

/* ── 浮动模式 ───────────────────────────────────────── */
.fp-float {
  position: fixed;
  z-index: 200;
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-default, #ddd);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  transition: box-shadow 0.15s;
}

.fp-float:hover {
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
}

.fp-float__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default, #ddd);
  background: var(--surface-page, #fafafa);
  cursor: move;
  user-select: none;
}

.fp-float__body {
  padding: 0;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}

.fp-float--minimized {
  border-radius: 8px;
}

.fp-float--minimized .fp-float__header {
  border-bottom: none;
}

/* ── 通用 ───────────────────────────────────────────── */
.fp-drag-handle {
  font-size: 16px;
  color: var(--color-text-secondary, #aaa);
  cursor: grab;
  flex-shrink: 0;
  line-height: 1;
}

.fp-drag-handle:active { cursor: grabbing; }

.fp-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary, #888);
  padding: 2px 4px;
  font-size: 13px;
  border-radius: 3px;
  line-height: 1;
  transition: background 0.12s, color 0.12s;
}

.fp-btn:hover {
  background: var(--surface-hover, #f0f0f0);
  color: var(--color-text, #333);
}
</style>
