<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { GridMap as GridMapState, GridToken } from '@trpg/shared';
import { socketClient } from '../../socket/socket-client';
import { api } from '../../utils/api';

const props = defineProps<{
  campaignId: string;
  sceneId: string;
  isGM?: boolean;
  characters: Array<{ id: string; name: string; sceneId?: string }>;
  npcs: Array<{ id: string; name: string; display_name?: string }>;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 768);
const loading = ref(false);
const error = ref('');
const mapState = ref<GridMapState | null>(null);

const viewOffset = ref({ x: 16, y: 16 });
const scale = ref(1);
const draggingTokenId = ref<string | null>(null);
const draggingPos = ref({ x: 0, y: 0 });
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const panOrigin = ref({ x: 0, y: 0 });

const cols = computed(() => mapState.value?.cols ?? 12);
const rows = computed(() => mapState.value?.rows ?? 10);
const cellSize = computed(() => mapState.value?.cell_size ?? 48);
const tokens = computed(() => mapState.value?.tokens ?? []);

function tokenLabel(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || 'TK';
}

function buildSeedTokens(): GridToken[] {
  const sceneCharacters = props.characters.filter((character) => character.sceneId === props.sceneId);
  const characterTokens = sceneCharacters.map((character, index) => ({
    id: `pc:${character.id}`,
    entity_type: 'character' as const,
    entity_id: character.id,
    label: tokenLabel(character.name),
    x: index % 6,
    y: Math.floor(index / 6),
    color: '#2f80ed',
  }));
  const npcTokens = props.npcs.map((npc, index) => ({
    id: `npc:${npc.id}`,
    entity_type: 'npc' as const,
    entity_id: npc.id,
    label: tokenLabel(npc.display_name || npc.name),
    x: index % 6,
    y: Math.floor(index / 6) + Math.max(1, Math.ceil(characterTokens.length / 6)),
    color: '#d97706',
  }));
  return [...characterTokens, ...npcTokens];
}

async function ensureSeedTokens() {
  if (!mapState.value || mapState.value.tokens.length > 0) return;
  const seedTokens = buildSeedTokens();
  mapState.value = { ...mapState.value, tokens: seedTokens };
  if (props.isGM) {
    try {
      mapState.value = await api.put<GridMapState>(`/campaigns/${props.campaignId}/scenes/${props.sceneId}/grid-map`, {
        tokens: seedTokens,
      });
    } catch {
      // ignore seed save errors; local preview still works
    }
  }
}

async function loadGridMap() {
  if (!props.sceneId) return;
  loading.value = true;
  error.value = '';
  try {
    mapState.value = await api.get<GridMapState>(`/campaigns/${props.campaignId}/scenes/${props.sceneId}/grid-map`);
    await ensureSeedTokens();
    resize();
  } catch (err: any) {
    error.value = err?.message ?? '地图加载失败';
  } finally {
    loading.value = false;
  }
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(viewOffset.value.x, viewOffset.value.y);
  ctx.scale(scale.value, scale.value);

  ctx.fillStyle = '#f7f2e7';
  ctx.fillRect(0, 0, cols.value * cellSize.value, rows.value * cellSize.value);

  ctx.strokeStyle = 'rgba(94, 77, 49, 0.24)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols.value; c += 1) {
    ctx.beginPath();
    ctx.moveTo(c * cellSize.value, 0);
    ctx.lineTo(c * cellSize.value, rows.value * cellSize.value);
    ctx.stroke();
  }
  for (let r = 0; r <= rows.value; r += 1) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellSize.value);
    ctx.lineTo(cols.value * cellSize.value, r * cellSize.value);
    ctx.stroke();
  }

  tokens.value.forEach((token) => {
    const px = token.id === draggingTokenId.value ? draggingPos.value.x : token.x * cellSize.value;
    const py = token.id === draggingTokenId.value ? draggingPos.value.y : token.y * cellSize.value;
    ctx.fillStyle = token.color;
    ctx.beginPath();
    ctx.arc(px + cellSize.value / 2, py + cellSize.value / 2, cellSize.value / 2 - 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(12, cellSize.value / 3)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(token.label, px + cellSize.value / 2, py + cellSize.value / 2);
  });

  ctx.restore();
}

function canvasToGrid(clientX: number, clientY: number) {
  const rect = canvasRef.value!.getBoundingClientRect();
  const x = (clientX - rect.left - viewOffset.value.x) / scale.value;
  const y = (clientY - rect.top - viewOffset.value.y) / scale.value;
  return {
    gx: Math.floor(x / cellSize.value),
    gy: Math.floor(y / cellSize.value),
  };
}

function getTokenAt(clientX: number, clientY: number) {
  const { gx, gy } = canvasToGrid(clientX, clientY);
  return tokens.value.find((token) => token.x === gx && token.y === gy) ?? null;
}

function onMouseDown(event: MouseEvent) {
  if (event.button === 2) {
    isPanning.value = true;
    panStart.value = { x: event.clientX, y: event.clientY };
    panOrigin.value = { ...viewOffset.value };
    return;
  }
  if (!props.isGM) return;
  const token = getTokenAt(event.clientX, event.clientY);
  if (!token) return;
  draggingTokenId.value = token.id;
  const rect = canvasRef.value!.getBoundingClientRect();
  draggingPos.value = {
    x: (event.clientX - rect.left - viewOffset.value.x) / scale.value - cellSize.value / 2,
    y: (event.clientY - rect.top - viewOffset.value.y) / scale.value - cellSize.value / 2,
  };
}

function onMouseMove(event: MouseEvent) {
  if (draggingTokenId.value) {
    const rect = canvasRef.value!.getBoundingClientRect();
    draggingPos.value = {
      x: (event.clientX - rect.left - viewOffset.value.x) / scale.value - cellSize.value / 2,
      y: (event.clientY - rect.top - viewOffset.value.y) / scale.value - cellSize.value / 2,
    };
    draw();
    return;
  }
  if (isPanning.value) {
    viewOffset.value = {
      x: panOrigin.value.x + event.clientX - panStart.value.x,
      y: panOrigin.value.y + event.clientY - panStart.value.y,
    };
    draw();
  }
}

function onMouseUp(event: MouseEvent) {
  if (draggingTokenId.value && mapState.value) {
    const token = tokens.value.find((item) => item.id === draggingTokenId.value);
    if (token) {
      const { gx, gy } = canvasToGrid(event.clientX, event.clientY);
      const nextToken: GridToken = {
        ...token,
        x: Math.max(0, Math.min(cols.value - 1, gx)),
        y: Math.max(0, Math.min(rows.value - 1, gy)),
      };
      mapState.value = {
        ...mapState.value,
        tokens: tokens.value.map((item) => (item.id === nextToken.id ? nextToken : item)),
      };
      socketClient.moveGridToken(props.campaignId, props.sceneId, nextToken);
    }
    draggingTokenId.value = null;
    draw();
  }
  isPanning.value = false;
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.1 : 0.9;
  scale.value = Math.max(0.4, Math.min(2.5, scale.value * factor));
  draw();
}

function onContextMenu(event: Event) {
  event.preventDefault();
}

function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  draw();
}

const handleGridTokenMoved = (payload: { campaign_id: string; scene_id: string; token: GridToken }) => {
  if (!mapState.value) return;
  if (payload.campaign_id !== props.campaignId || payload.scene_id !== props.sceneId) return;

  const exists = mapState.value.tokens.some((token) => token.id === payload.token.id);
  mapState.value = {
    ...mapState.value,
    tokens: exists
      ? mapState.value.tokens.map((token) => (token.id === payload.token.id ? payload.token : token))
      : [...mapState.value.tokens, payload.token],
  };
  draw();
};

watch(() => props.sceneId, () => {
  mapState.value = null;
  loadGridMap();
});

watch(tokens, () => draw(), { deep: true });

onMounted(() => {
  loadGridMap();
  resize();
  window.addEventListener('resize', resize);
  socketClient.onGridTokenMoved(handleGridTokenMoved);
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  socketClient.getRoomSocket()?.off('grid_token_moved', handleGridTokenMoved);
});
</script>

<template>
  <div class="grid-map-shell">
    <div class="grid-toolbar">
      <span class="grid-stats">{{ cols }} × {{ rows }} · {{ tokens.length }} tokens</span>
      <span v-if="isGM" class="grid-hint">拖拽 token 移动，右键平移，滚轮缩放</span>
      <span v-else class="grid-hint">只读地图预览</span>
    </div>
    <div v-if="loading" class="grid-empty">地图加载中...</div>
    <div v-else-if="error" class="grid-empty">{{ error }}</div>
    <div v-else-if="isMobile" class="mobile-view">
      <canvas ref="canvasRef" class="map-canvas static" :style="{ height: rows * cellSize + 'px' }" />
      <div class="token-list">
        <div v-for="token in tokens" :key="token.id" class="token-list-item">
          <span class="token-dot" :style="{ background: token.color }" />
          <span class="token-name">{{ token.label }}</span>
          <span class="token-pos">({{ token.x }}, {{ token.y }})</span>
        </div>
      </div>
    </div>
    <canvas
      v-else
      ref="canvasRef"
      class="map-canvas"
      :class="{ interactive: isGM }"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel.passive="onWheel"
      @contextmenu="onContextMenu"
    />
  </div>
</template>

<style scoped>
.grid-map-shell { height: 100%; display: flex; flex-direction: column; gap: var(--space-2); }
.grid-toolbar { display: flex; justify-content: space-between; gap: var(--space-2); font-size: var(--text-xs); color: var(--color-text-muted); }
.grid-stats { font-weight: 600; color: var(--color-text-primary); }
.grid-hint { text-align: right; }
.map-canvas { flex: 1; min-height: 280px; width: 100%; border-radius: var(--radius-md); border: 1px solid var(--color-card-border); background: linear-gradient(180deg, #fbf6ec 0%, #f0e8d8 100%); cursor: default; }
.map-canvas.interactive { cursor: grab; }
.map-canvas.static { min-height: auto; }
.grid-empty { display: flex; align-items: center; justify-content: center; min-height: 220px; border: 1px dashed var(--color-card-border); border-radius: var(--radius-md); color: var(--color-text-muted); }
.mobile-view { display: flex; flex-direction: column; gap: var(--space-3); }
.token-list { display: flex; flex-direction: column; gap: var(--space-2); }
.token-list-item { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.token-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.token-name { font-weight: 600; }
.token-pos { color: var(--color-text-muted); font-family: var(--font-mono); font-size: var(--text-xs); }
</style>
