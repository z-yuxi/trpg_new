<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { GridMap as GridMapState, GridToken, GridOverlay } from '@trpg/shared';
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
const backgroundDraft = ref('');
const savingBackground = ref(false);

const viewOffset = ref({ x: 36, y: 36 });
const scale = ref(1);
const draggingTokenId = ref<string | null>(null);
const draggingPos = ref({ x: 0, y: 0 });
const selectedTokenId = ref<string | null>(null);
const backgroundImage = ref<HTMLImageElement | null>(null);
const measureMode = ref(false);
const measureStart = ref<{ x: number; y: number } | null>(null);
const measureEnd = ref<{ x: number; y: number } | null>(null);

// 地图平移（鼠标）
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const panOffsetStart = ref({ x: 0, y: 0 });

// 区域高亮叠加层
const overlays = computed(() => mapState.value?.overlays ?? []);
const areaDrawMode = ref(false);
const areaDrawStart = ref<{ x: number; y: number } | null>(null);
const areaDrawCurrent = ref<{ x: number; y: number } | null>(null);
const pendingColor = ref('rgba(239,68,68,0.35)');

const AREA_COLORS = [
  { label: '火焰', value: 'rgba(239,68,68,0.35)' },
  { label: '毒雾', value: 'rgba(34,197,94,0.35)' },
  { label: '冰霜', value: 'rgba(59,130,246,0.35)' },
  { label: '阴影', value: 'rgba(30,30,60,0.45)' },
  { label: '神圣', value: 'rgba(251,191,36,0.35)' },
];

// 触摸手势状态
let touchPanStart = { x: 0, y: 0 };
let pinchStartDist = 0;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let touchSelectedTokenId: string | null = null;
let touchDragging = false;

const cols = computed(() => mapState.value?.cols ?? 12);
const rows = computed(() => mapState.value?.rows ?? 10);
const cellSize = computed(() => mapState.value?.cell_size ?? 48);
const tokens = computed(() => mapState.value?.tokens ?? []);
const measureDistance = computed(() => {
  if (!measureStart.value || !measureEnd.value) return null;
  return Math.abs(measureStart.value.x - measureEnd.value.x) + Math.abs(measureStart.value.y - measureEnd.value.y);
});

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
    color: '#4A7A9F',
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

async function persistMap(updates: Partial<Pick<GridMapState, 'tokens' | 'background_image_url' | 'cols' | 'rows' | 'cell_size' | 'overlays'>>) {
  mapState.value = await api.put<GridMapState>(`/campaigns/${props.campaignId}/scenes/${props.sceneId}/grid-map`, updates);
  backgroundDraft.value = mapState.value.background_image_url ?? '';
  await loadBackground();
  draw();
}

async function ensureSeedTokens() {
  if (!mapState.value || mapState.value.tokens.length > 0) return;
  const seedTokens = buildSeedTokens();
  mapState.value = { ...mapState.value, tokens: seedTokens };
  if (props.isGM) {
    try {
      await persistMap({ tokens: seedTokens });
    } catch {
      // keep local preview
    }
  }
}

async function loadBackground() {
  const url = mapState.value?.background_image_url;
  if (!url) {
    backgroundImage.value = null;
    return;
  }

  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });
  backgroundImage.value = image.complete ? image : null;
}

async function loadGridMap() {
  if (!props.sceneId) return;
  loading.value = true;
  error.value = '';
  try {
    mapState.value = await api.get<GridMapState>(`/campaigns/${props.campaignId}/scenes/${props.sceneId}/grid-map`);
    backgroundDraft.value = mapState.value.background_image_url ?? '';
    await ensureSeedTokens();
    await loadBackground();
    resize();
  } catch (err: any) {
    error.value = err?.message ?? '地图加载失败';
  } finally {
    loading.value = false;
  }
}

function toCellName(x: number, y: number) {
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function drawCoordinateLabels(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let col = 0; col < cols.value; col += 1) {
    ctx.fillText(String.fromCharCode(65 + col), col * cellSize.value + cellSize.value / 2, -14);
  }
  ctx.textAlign = 'right';
  for (let row = 0; row < rows.value; row += 1) {
    ctx.fillText(String(row + 1), -8, row * cellSize.value + cellSize.value / 2);
  }
}

function drawOverlays(ctx: CanvasRenderingContext2D) {
  for (const ov of overlays.value) {
    ctx.fillStyle = ov.color;
    ctx.fillRect(ov.x * cellSize.value, ov.y * cellSize.value, ov.w * cellSize.value, ov.h * cellSize.value);
    if (ov.label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 14px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ov.label, (ov.x + ov.w / 2) * cellSize.value, (ov.y + ov.h / 2) * cellSize.value);
    }
  }
  if (areaDrawStart.value && areaDrawCurrent.value) {
    const x = Math.min(areaDrawStart.value.x, areaDrawCurrent.value.x);
    const y = Math.min(areaDrawStart.value.y, areaDrawCurrent.value.y);
    const w = Math.abs(areaDrawStart.value.x - areaDrawCurrent.value.x) + 1;
    const h = Math.abs(areaDrawStart.value.y - areaDrawCurrent.value.y) + 1;
    ctx.fillStyle = pendingColor.value;
    ctx.fillRect(x * cellSize.value, y * cellSize.value, w * cellSize.value, h * cellSize.value);
    const stroke = pendingColor.value.replace(/,[^,]+\)$/, ',0.9)');
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x * cellSize.value, y * cellSize.value, w * cellSize.value, h * cellSize.value);
  }
}

function drawMeasureOverlay(ctx: CanvasRenderingContext2D) {
  if (!measureStart.value) return;
  const end = measureEnd.value ?? measureStart.value;
  const minX = Math.min(measureStart.value.x, end.x);
  const minY = Math.min(measureStart.value.y, end.y);
  const width = Math.abs(measureStart.value.x - end.x) + 1;
  const height = Math.abs(measureStart.value.y - end.y) + 1;

  ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
  ctx.fillRect(minX * cellSize.value, minY * cellSize.value, width * cellSize.value, height * cellSize.value);
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.65)';
  ctx.lineWidth = 2;
  ctx.strokeRect(minX * cellSize.value, minY * cellSize.value, width * cellSize.value, height * cellSize.value);
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

  if (backgroundImage.value) {
    ctx.drawImage(backgroundImage.value, 0, 0, cols.value * cellSize.value, rows.value * cellSize.value);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, cols.value * cellSize.value, rows.value * cellSize.value);
  }

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

  drawMeasureOverlay(ctx);
  drawOverlays(ctx);
  drawCoordinateLabels(ctx);

  tokens.value.forEach((token) => {
    const px = token.id === draggingTokenId.value ? draggingPos.value.x : token.x * cellSize.value;
    const py = token.id === draggingTokenId.value ? draggingPos.value.y : token.y * cellSize.value;
    const centerX = px + cellSize.value / 2;
    const centerY = py + cellSize.value / 2;
    const selected = token.id === selectedTokenId.value;

    ctx.fillStyle = token.color;
    if (token.entity_type === 'object') {
      ctx.fillRect(px + 6, py + 6, cellSize.value - 12, cellSize.value - 12);
    } else {
      ctx.beginPath();
      ctx.arc(centerX, centerY, cellSize.value / 2 - 5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selected) {
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 3, py + 3, cellSize.value - 6, cellSize.value - 6);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(12, cellSize.value / 3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(token.label, centerX, centerY);
  });

  ctx.restore();
}

function canvasToGrid(clientX: number, clientY: number) {
  const rect = canvasRef.value!.getBoundingClientRect();
  const x = (clientX - rect.left - viewOffset.value.x) / scale.value;
  const y = (clientY - rect.top - viewOffset.value.y) / scale.value;
  return {
    gx: Math.max(0, Math.min(cols.value - 1, Math.floor(x / cellSize.value))),
    gy: Math.max(0, Math.min(rows.value - 1, Math.floor(y / cellSize.value))),
  };
}

function getTokenAt(clientX: number, clientY: number) {
  const { gx, gy } = canvasToGrid(clientX, clientY);
  return tokens.value.find((token) => token.x === gx && token.y === gy) ?? null;
}

async function updateToken(nextToken: GridToken) {
  if (!mapState.value) return;
  mapState.value = {
    ...mapState.value,
    tokens: tokens.value.map((item) => (item.id === nextToken.id ? nextToken : item)),
  };
  draw();
  socketClient.moveGridToken(props.campaignId, props.sceneId, nextToken);
  if (props.isGM) {
    await persistMap({ tokens: mapState.value.tokens });
  }
}

function onMouseDown(event: MouseEvent) {
  const token = getTokenAt(event.clientX, event.clientY);
  if (token) selectedTokenId.value = token.id;

  if (measureMode.value) {
    const { gx, gy } = canvasToGrid(event.clientX, event.clientY);
    if (!measureStart.value || measureEnd.value) {
      measureStart.value = { x: gx, y: gy };
      measureEnd.value = null;
    } else {
      measureEnd.value = { x: gx, y: gy };
    }
    draw();
    return;
  }

  if (areaDrawMode.value && props.isGM) {
    const { gx, gy } = canvasToGrid(event.clientX, event.clientY);
    areaDrawStart.value = { x: gx, y: gy };
    areaDrawCurrent.value = { x: gx, y: gy };
    return;
  }

  if (props.isGM && token) {
    draggingTokenId.value = token.id;
    const rect = canvasRef.value!.getBoundingClientRect();
    draggingPos.value = {
      x: (event.clientX - rect.left - viewOffset.value.x) / scale.value - cellSize.value / 2,
      y: (event.clientY - rect.top - viewOffset.value.y) / scale.value - cellSize.value / 2,
    };
    return;
  }

  if (!token) {
    isPanning.value = true;
    panStart.value = { x: event.clientX, y: event.clientY };
    panOffsetStart.value = { ...viewOffset.value };
  }
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
  if (areaDrawMode.value && areaDrawStart.value) {
    const { gx, gy } = canvasToGrid(event.clientX, event.clientY);
    areaDrawCurrent.value = { x: gx, y: gy };
    draw();
    return;
  }
  if (isPanning.value) {
    viewOffset.value = {
      x: panOffsetStart.value.x + (event.clientX - panStart.value.x),
      y: panOffsetStart.value.y + (event.clientY - panStart.value.y),
    };
    draw();
  }
}

async function onMouseUp(event: MouseEvent) {
  if (areaDrawMode.value && areaDrawStart.value) {
    await finalizeAreaDraw(event.clientX, event.clientY);
    return;
  }
  isPanning.value = false;
  if (!draggingTokenId.value) return;
  const token = tokens.value.find((item) => item.id === draggingTokenId.value);
  draggingTokenId.value = null;
  if (!token) return;
  const { gx, gy } = canvasToGrid(event.clientX, event.clientY);
  await updateToken({ ...token, x: gx, y: gy });
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.1 : 0.9;
  scale.value = Math.max(0.45, Math.min(2.4, scale.value * factor));
  draw();
}

function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  draw();
}

async function saveBackground() {
  if (!props.isGM) return;
  savingBackground.value = true;
  try {
    await persistMap({ background_image_url: backgroundDraft.value.trim() || null });
  } catch (err: any) {
    error.value = err?.message ?? '背景图保存失败';
  } finally {
    savingBackground.value = false;
  }
}

async function addObjectToken() {
  if (!props.isGM || !mapState.value) return;
  const nextToken: GridToken = {
    id: `obj:${Date.now()}`,
    entity_type: 'object',
    entity_id: `obj:${Date.now()}`,
    label: 'MK',
    x: 0,
    y: 0,
    color: '#7c3aed',
  };
  await persistMap({ tokens: [...tokens.value, nextToken] });
  socketClient.moveGridToken(props.campaignId, props.sceneId, nextToken);
}

async function removeToken(tokenId: string) {
  if (!props.isGM || !mapState.value) return;
  const token = tokens.value.find((item) => item.id === tokenId);
  if (!token || token.entity_type !== 'object') return;
  await persistMap({ tokens: tokens.value.filter((item) => item.id !== tokenId) });
  selectedTokenId.value = selectedTokenId.value === tokenId ? null : selectedTokenId.value;
}

async function moveTokenFromPanel(tokenId: string, axis: 'x' | 'y', value: number) {
  const token = tokens.value.find((item) => item.id === tokenId);
  if (!token) return;
  const nextToken = {
    ...token,
    [axis]: axis === 'x'
      ? Math.max(0, Math.min(cols.value - 1, value))
      : Math.max(0, Math.min(rows.value - 1, value)),
  };
  await updateToken(nextToken);
}

function resetMeasure() {
  measureStart.value = null;
  measureEnd.value = null;
  draw();
}

async function finalizeAreaDraw(clientX: number, clientY: number) {
  if (!areaDrawStart.value || !mapState.value) { areaDrawStart.value = null; areaDrawCurrent.value = null; return; }
  const end = areaDrawCurrent.value ?? areaDrawStart.value;
  const x = Math.min(areaDrawStart.value.x, end.x);
  const y = Math.min(areaDrawStart.value.y, end.y);
  const w = Math.abs(areaDrawStart.value.x - end.x) + 1;
  const h = Math.abs(areaDrawStart.value.y - end.y) + 1;
  areaDrawStart.value = null;
  areaDrawCurrent.value = null;
  const newOverlay: GridOverlay = { id: `ov:${Date.now()}`, x, y, w, h, color: pendingColor.value };
  const newOverlays = [...overlays.value, newOverlay];
  mapState.value = { ...mapState.value, overlays: newOverlays };
  draw();
  socketClient.markGridArea(props.campaignId, props.sceneId, newOverlays);
  if (props.isGM) {
    try { await persistMap({ tokens: mapState.value.tokens, overlays: newOverlays }); } catch { /* ignore */ }
  }
}

async function clearAllOverlays() {
  if (!mapState.value || !props.isGM) return;
  mapState.value = { ...mapState.value, overlays: [] };
  draw();
  socketClient.markGridArea(props.campaignId, props.sceneId, []);
  try { await persistMap({ tokens: mapState.value.tokens, overlays: [] }); } catch { /* ignore */ }
}

// ── 触摸事件处理 ─────────────────────────────────────────────────────────

function onTouchStart(event: TouchEvent) {
  event.preventDefault();
  if (event.touches.length === 1) {
    const t = event.touches[0]!;
    touchPanStart = { x: t.clientX, y: t.clientY };
    touchDragging = false;
    touchSelectedTokenId = null;
    longPressTimer = setTimeout(() => {
      const token = getTokenAt(t.clientX, t.clientY);
      if (token) {
        touchSelectedTokenId = token.id;
        selectedTokenId.value = token.id;
        touchDragging = true;
        draw();
      }
    }, 400);
  } else if (event.touches.length === 2) {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    const a = event.touches[0]!;
    const b = event.touches[1]!;
    pinchStartDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }
}

function onTouchMove(event: TouchEvent) {
  event.preventDefault();
  if (event.touches.length === 1) {
    const t = event.touches[0]!;
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (touchDragging && touchSelectedTokenId && props.isGM) {
      const rect = canvasRef.value!.getBoundingClientRect();
      draggingTokenId.value = touchSelectedTokenId;
      draggingPos.value = {
        x: (t.clientX - rect.left - viewOffset.value.x) / scale.value - cellSize.value / 2,
        y: (t.clientY - rect.top - viewOffset.value.y) / scale.value - cellSize.value / 2,
      };
      draw();
    } else {
      const dx = t.clientX - touchPanStart.x;
      const dy = t.clientY - touchPanStart.y;
      viewOffset.value = { x: viewOffset.value.x + dx, y: viewOffset.value.y + dy };
      touchPanStart = { x: t.clientX, y: t.clientY };
      draw();
    }
  } else if (event.touches.length === 2) {
    const a = event.touches[0]!;
    const b = event.touches[1]!;
    const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    scale.value = Math.max(0.45, Math.min(2.4, scale.value * (dist / pinchStartDist)));
    pinchStartDist = dist;
    draw();
  }
}

async function onTouchEnd(event: TouchEvent) {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  if (touchDragging && touchSelectedTokenId && event.changedTouches.length > 0) {
    const t = event.changedTouches[0]!;
    const token = tokens.value.find((item) => item.id === touchSelectedTokenId);
    draggingTokenId.value = null;
    touchDragging = false;
    touchSelectedTokenId = null;
    if (token) {
      const { gx, gy } = canvasToGrid(t.clientX, t.clientY);
      await updateToken({ ...token, x: gx, y: gy });
    }
    return;
  }
  touchDragging = false;
  touchSelectedTokenId = null;
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
  window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 768; });
  socketClient.onGridTokenMoved(handleGridTokenMoved);
  socketClient.onGridAreaMarked((payload) => {
    if (!mapState.value) return;
    if (payload.campaign_id !== props.campaignId || payload.scene_id !== props.sceneId) return;
    mapState.value = { ...mapState.value, overlays: payload.overlays };
    draw();
  });
});

onUnmounted(() => {
  window.removeEventListener('resize', resize);
  socketClient.getRoomSocket()?.off('grid_token_moved', handleGridTokenMoved);
});
</script>

<template>
  <div class="grid-map-shell">
    <div class="grid-toolbar">
      <div class="toolbar-main">
        <span class="grid-stats">{{ cols }} × {{ rows }} · {{ tokens.length }} tokens</span>
        <span v-if="measureDistance !== null" class="grid-measure">测距：{{ measureDistance }} 格</span>
      </div>
      <div v-if="isGM" class="toolbar-actions">
        <button class="tool-btn" :class="{ active: measureMode }" @click="measureMode = !measureMode; if (!measureMode) resetMeasure()">测距</button>
        <button class="tool-btn" :class="{ active: areaDrawMode }" @click="areaDrawMode = !areaDrawMode; measureMode = false">区域</button>
        <template v-if="areaDrawMode">
          <button
            v-for="c in AREA_COLORS"
            :key="c.value"
            class="color-btn"
            :class="{ 'color-selected': pendingColor === c.value }"
            :style="{ background: c.value }"
            :title="c.label"
            @click="pendingColor = c.value"
          >{{ c.label }}</button>
          <button class="tool-btn danger" @click="clearAllOverlays">清除全部</button>
        </template>
        <button class="tool-btn" @click="addObjectToken">添加标记</button>
      </div>
      <span v-else class="grid-hint">只读预览</span>
    </div>

    <div v-if="isGM" class="background-row">
      <input v-model="backgroundDraft" class="background-input" placeholder="粘贴地图背景图 URL" />
      <button class="tool-btn" :disabled="savingBackground" @click="saveBackground">{{ savingBackground ? '保存中…' : '保存背景' }}</button>
    </div>

    <div v-if="loading" class="grid-empty">地图加载中...</div>
    <div v-else-if="error" class="grid-empty">{{ error }}</div>
    <template v-else>
      <canvas
        ref="canvasRef"
        class="map-canvas"
        :class="{ interactive: isGM, 'area-draw': areaDrawMode }"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @wheel.passive="onWheel"
        @touchstart.prevent="onTouchStart"
        @touchmove.prevent="onTouchMove"
        @touchend.prevent="onTouchEnd"
      />

      <div class="side-panel">
        <div class="token-panel">
          <h4>Token 列表</h4>
          <div v-for="token in tokens" :key="token.id" class="token-row" :class="{ selected: selectedTokenId === token.id }" @click="selectedTokenId = token.id">
            <span class="token-dot" :style="{ background: token.color }" />
            <div class="token-meta">
              <strong>{{ token.label }}</strong>
              <span>{{ token.entity_type }} · {{ toCellName(token.x, token.y) }}</span>
            </div>
            <button v-if="isGM && token.entity_type === 'object'" class="mini-btn" @click.stop="removeToken(token.id)">删除</button>
          </div>
        </div>

        <div v-if="isMobile && isGM" class="mobile-move-panel">
          <h4>移动端坐标移动</h4>
          <div v-for="token in tokens" :key="`move-${token.id}`" class="move-row">
            <span>{{ token.label }}</span>
            <label>
              X
              <input class="coord-input" type="number" :min="0" :max="cols - 1" :value="token.x" @change="moveTokenFromPanel(token.id, 'x', Number(($event.target as HTMLInputElement).value))" />
            </label>
            <label>
              Y
              <input class="coord-input" type="number" :min="0" :max="rows - 1" :value="token.y" @change="moveTokenFromPanel(token.id, 'y', Number(($event.target as HTMLInputElement).value))" />
            </label>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.grid-map-shell {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: var(--space-3);
}
.grid-toolbar {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}
.toolbar-main,
.toolbar-actions,
.background-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.grid-stats { font-weight: 700; color: var(--color-text-primary); }
.grid-measure {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}
.grid-hint { text-align: right; }
.tool-btn,
.mini-btn {
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--color-card-bg);
  color: var(--color-text-primary);
  cursor: pointer;
}
.tool-btn { padding: 8px 12px; }
.mini-btn { padding: 4px 8px; font-size: var(--text-xs); }
.tool-btn.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.background-row {
  grid-column: 1 / -1;
}
.background-input,
.coord-input {
  height: 36px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--color-card-bg);
  color: var(--color-text-primary);
}
.background-input {
  flex: 1;
  padding: 0 12px;
}
.coord-input {
  width: 72px;
  padding: 0 8px;
}
.map-canvas {
  width: 100%;
  min-height: 420px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-card-border);
  background: linear-gradient(180deg, #fbf6ec 0%, #f0e8d8 100%);
}
.map-canvas.interactive { cursor: grab; }
.map-canvas.area-draw { cursor: crosshair; }
.color-btn {
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  padding: 4px 8px;
  font-size: var(--text-xs);
  cursor: pointer;
  color: #fff;
  text-shadow: 0 0 2px #000;
}
.color-btn.color-selected { border-color: var(--color-accent); }
.tool-btn.danger { color: #B85450; border-color: #B85450; }
.side-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.token-panel,
.mobile-move-panel {
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  background: var(--color-card-bg);
}
.token-panel h4,
.mobile-move-panel h4 { margin: 0 0 var(--space-2); color: var(--color-text-primary); }
.token-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.token-row.selected {
  background: rgba(37, 99, 235, 0.08);
}
.token-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.token-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.token-meta strong { color: var(--color-text-primary); font-size: var(--text-sm); }
.token-meta span { color: var(--color-text-muted); font-size: var(--text-xs); }
.move-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: var(--space-2);
  align-items: center;
  margin-top: var(--space-2);
}
.move-row label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}
.grid-empty {
  grid-column: 1 / -1;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--color-card-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .grid-map-shell {
    grid-template-columns: 1fr;
  }

  .grid-toolbar,
  .background-row,
  .toolbar-main,
  .toolbar-actions {
    flex-direction: column;
    align-items: flex-start;
  }

  .map-canvas {
    min-height: 320px;
  }
}
</style>
