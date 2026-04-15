<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';

interface Token {
  id: string;
  label: string;
  x: number; // grid col (0-indexed)
  y: number; // grid row (0-indexed)
  color: string;
  isPC: boolean;
}

const props = defineProps<{
  tokens: Token[];
  cols?: number;
  rows?: number;
  isGM?: boolean;
}>();

const emit = defineEmits<{
  (e: 'token-move', id: string, x: number, y: number): void;
}>();

const CELL = 40; // px per cell
const cols = computed(() => props.cols ?? 12);
const rows = computed(() => props.rows ?? 10);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 768);

// 视图状态
const viewOffset = ref({ x: 0, y: 0 });
const scale = ref(1);
const draggingTokenId = ref<string | null>(null);
const draggingPos = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const panOrigin = ref({ x: 0, y: 0 });

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(viewOffset.value.x, viewOffset.value.y);
  ctx.scale(scale.value, scale.value);

  // 绘制网格
  ctx.strokeStyle = 'rgba(128,128,128,0.3)';
  ctx.lineWidth = 0.5;
  for (let c = 0; c <= cols.value; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL, 0);
    ctx.lineTo(c * CELL, rows.value * CELL);
    ctx.stroke();
  }
  for (let r = 0; r <= rows.value; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL);
    ctx.lineTo(cols.value * CELL, r * CELL);
    ctx.stroke();
  }

  // 绘制 token
  for (const token of props.tokens) {
    const px = token.id === draggingTokenId.value ? draggingPos.value.x : token.x * CELL;
    const py = token.id === draggingTokenId.value ? draggingPos.value.y : token.y * CELL;
    ctx.fillStyle = token.color || '#4a9eff';
    ctx.beginPath();
    ctx.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${CELL / 3}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(token.label.slice(0, 2), px + CELL / 2, py + CELL / 2);
  }

  ctx.restore();
}

function canvasToGrid(cx: number, cy: number) {
  const canvas = canvasRef.value!.getBoundingClientRect();
  const x = (cx - canvas.left - viewOffset.value.x) / scale.value;
  const y = (cy - canvas.top - viewOffset.value.y) / scale.value;
  return { gx: Math.floor(x / CELL), gy: Math.floor(y / CELL) };
}

function getTokenAt(cx: number, cy: number) {
  const { gx, gy } = canvasToGrid(cx, cy);
  return props.tokens.find(t => t.x === gx && t.y === gy) ?? null;
}

function onMouseDown(e: MouseEvent) {
  if (!props.isGM) return;
  const token = getTokenAt(e.clientX, e.clientY);
  if (token) {
    draggingTokenId.value = token.id;
    const rect = canvasRef.value!.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewOffset.value.x) / scale.value - CELL / 2;
    const y = (e.clientY - rect.top - viewOffset.value.y) / scale.value - CELL / 2;
    draggingPos.value = { x, y };
  } else if (e.button === 2) {
    isPanning.value = true;
    panStart.value = { x: e.clientX, y: e.clientY };
    panOrigin.value = { ...viewOffset.value };
  }
}

function onMouseMove(e: MouseEvent) {
  if (draggingTokenId.value) {
    const rect = canvasRef.value!.getBoundingClientRect();
    const x = (e.clientX - rect.left - viewOffset.value.x) / scale.value - CELL / 2;
    const y = (e.clientY - rect.top - viewOffset.value.y) / scale.value - CELL / 2;
    draggingPos.value = { x, y };
    draw();
  } else if (isPanning.value) {
    viewOffset.value = {
      x: panOrigin.value.x + e.clientX - panStart.value.x,
      y: panOrigin.value.y + e.clientY - panStart.value.y,
    };
    draw();
  }
}

function onMouseUp(e: MouseEvent) {
  if (draggingTokenId.value) {
    const { gx, gy } = canvasToGrid(e.clientX, e.clientY);
    const boundX = Math.max(0, Math.min(cols.value - 1, gx));
    const boundY = Math.max(0, Math.min(rows.value - 1, gy));
    emit('token-move', draggingTokenId.value, boundX, boundY);
    draggingTokenId.value = null;
    draw();
  }
  isPanning.value = false;
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  scale.value = Math.max(0.3, Math.min(3, scale.value * factor));
  draw();
}

function onContextMenu(e: Event) { e.preventDefault(); }

function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  draw();
}

watch(() => props.tokens, draw, { deep: true });

onMounted(() => {
  resize();
  window.addEventListener('resize', resize);
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
});
</script>

<template>
  <div class="grid-map">
    <!-- 移动端：静态预览 + token 列表 -->
    <div v-if="isMobile" class="mobile-view">
      <canvas
        ref="canvasRef"
        class="map-canvas static"
        :style="{ height: rows * 40 + 'px' }"
      />
      <div class="token-list">
        <div v-for="token in tokens" :key="token.id" class="token-list-item">
          <span class="token-dot" :style="{ background: token.color }" />
          <span class="token-name">{{ token.label }}</span>
          <span class="token-pos">({{ token.x }}, {{ token.y }})</span>
        </div>
      </div>
    </div>

    <!-- 桌面端：交互地图 -->
    <canvas
      v-else
      ref="canvasRef"
      class="map-canvas"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @wheel.passive="onWheel"
      @contextmenu="onContextMenu"
    />

    <!-- GM 提示 -->
    <div v-if="isGM && !isMobile" class="hint">
      拖拽 token 移动 · 右键拖拽平移 · 滚轮缩放
    </div>
  </div>
</template>

<style scoped>
.grid-map { height: 100%; display: flex; flex-direction: column; }
.map-canvas { flex: 1; width: 100%; cursor: crosshair; border-radius: var(--radius-md); border: 1px solid var(--color-card-border); background: var(--color-surface); }
.map-canvas.static { cursor: default; }
.hint { font-size: var(--text-xs); color: var(--color-text-muted); text-align: center; padding: var(--space-1) 0; }
.mobile-view { display: flex; flex-direction: column; gap: var(--space-3); }
.token-list { display: flex; flex-direction: column; gap: var(--space-2); }
.token-list-item { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.token-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.token-name { font-weight: 600; }
.token-pos { color: var(--color-text-muted); font-family: var(--font-mono); font-size: var(--text-xs); }
</style>
