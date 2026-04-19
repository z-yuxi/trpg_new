<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Scene, SceneConnection } from '@trpg/shared';
import { useAuthStore } from '../../stores/auth-store';

const props = defineProps<{
  campaignId: string;
  scenes: Scene[];
  isGm?: boolean;
}>();

const authStore = useAuthStore();
const connections = ref<SceneConnection[]>([]);
const loading = ref(false);
const showEditDialog = ref(false);
const editConn = ref<Partial<SceneConnection> & { fromId: string; toId: string }>({ fromId: '', toId: '', walk_duration: 10, is_bidirectional: true });
const saving = ref(false);

async function loadConnections() {
  loading.value = true;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/scene-connections`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) connections.value = await res.json();
  } catch { /* ignore */ }
  finally { loading.value = false; }
}

async function saveConnection() {
  saving.value = true;
  try {
    const body = {
      from_scene_id: editConn.value.fromId,
      to_scene_id: editConn.value.toId,
      walk_duration: Number(editConn.value.walk_duration) || 10,
      is_bidirectional: editConn.value.is_bidirectional ?? true,
    };
    const res = await fetch(`/api/campaigns/${props.campaignId}/scene-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const conn = await res.json();
      connections.value.push(conn);
      showEditDialog.value = false;
      editConn.value = { fromId: '', toId: '', walk_duration: 10, is_bidirectional: true };
    }
  } catch { /* ignore */ }
  finally { saving.value = false; }
}

function sceneName(id: string) {
  return props.scenes.find(s => s.id === id)?.name ?? id;
}

function openAddConn() {
  editConn.value = { fromId: '', toId: '', walk_duration: 10, is_bidirectional: true };
  showEditDialog.value = true;
}

function openEditConn(conn: SceneConnection) {
  editConn.value = {
    id: conn.id,
    fromId: conn.from_scene_id,
    toId: conn.to_scene_id,
    walk_duration: conn.walk_duration,
    is_bidirectional: conn.is_bidirectional,
  };
  showEditDialog.value = true;
}

// 简单力导向布局：按索引均分角度摆放场景节点
const NODE_R = 28;
const SVG_W = 360;
const SVG_H = 240;
const CX = SVG_W / 2;
const CY = SVG_H / 2;
const ORBIT_R = 88;

const nodes = computed(() => {
  const len = props.scenes.length;
  if (len === 0) return [];
  return props.scenes.map((s, i) => {
    const angle = (2 * Math.PI * i) / len - Math.PI / 2;
    return {
      id: s.id,
      name: s.name.length > 6 ? s.name.slice(0, 5) + '…' : s.name,
      x: len === 1 ? CX : CX + ORBIT_R * Math.cos(angle),
      y: len === 1 ? CY : CY + ORBIT_R * Math.sin(angle),
    };
  });
});

const nodeMap = computed(() => new Map(nodes.value.map(n => [n.id, n])));

const edges = computed(() => connections.value.map(c => ({
  conn: c,
  from: nodeMap.value.get(c.from_scene_id),
  to: nodeMap.value.get(c.to_scene_id),
})).filter(e => e.from && e.to));

function formatDur(min: number) {
  if (min < 60) return `${min}分`;
  return `${Math.floor(min / 60)}时${min % 60 ? (min % 60) + '分' : ''}`;
}

function midLabel(e: { from: { x: number; y: number } | undefined; to: { x: number; y: number } | undefined }) {
  if (!e.from || !e.to) return { x: 0, y: 0 };
  return { x: (e.from.x + e.to.x) / 2, y: (e.from.y + e.to.y) / 2 - 6 };
}

onMounted(() => {
  loadConnections();
});
</script>

<template>
  <div class="scene-roadmap">
    <div class="roadmap-header">
      <span class="roadmap-title">场景路线图</span>
      <button v-if="isGm" class="sm-btn accent" @click="openAddConn">+ 添加连接</button>
    </div>

    <div v-if="loading" class="roadmap-hint">加载中...</div>
    <div v-else-if="scenes.length === 0" class="roadmap-hint">暂无场景</div>
    <div v-else class="roadmap-svg-wrap">
      <svg :width="SVG_W" :height="SVG_H" class="roadmap-svg">
        <!-- 连线 -->
        <g v-for="(e, i) in edges" :key="i">
          <line
            :x1="e.from!.x" :y1="e.from!.y"
            :x2="e.to!.x" :y2="e.to!.y"
            class="edge-line"
          />
          <text
            :x="midLabel(e).x"
            :y="midLabel(e).y"
            class="edge-label"
          >{{ formatDur(e.conn.walk_duration) }}</text>
          <!-- 编辑按钮区域（GM 模式） -->
          <circle
            v-if="isGm"
            :cx="midLabel(e).x" :cy="midLabel(e).y + 8"
            r="7" fill="transparent" class="edge-edit"
            @click="openEditConn(e.conn)"
          />
        </g>
        <!-- 节点 -->
        <g v-for="node in nodes" :key="node.id" class="node-group">
          <circle :cx="node.x" :cy="node.y" :r="NODE_R" class="node-circle" />
          <text :x="node.x" :y="node.y + 4" class="node-label">{{ node.name }}</text>
        </g>
      </svg>
    </div>

    <!-- 连接列表（文字备览） -->
    <div v-if="connections.length > 0" class="conn-list">
      <div v-for="conn in connections" :key="conn.id" class="conn-row">
        <span class="conn-from">{{ sceneName(conn.from_scene_id) }}</span>
        <span class="conn-arrow">{{ conn.is_bidirectional ? '⇄' : '→' }}</span>
        <span class="conn-to">{{ sceneName(conn.to_scene_id) }}</span>
        <span class="conn-dur">步行 {{ formatDur(conn.walk_duration) }}</span>
        <button v-if="isGm" class="sm-btn" @click="openEditConn(conn)">编辑</button>
      </div>
    </div>
    <div v-else-if="!loading" class="roadmap-hint">暂无场景连接，GM 可点击添加</div>

    <!-- 添加/编辑对话框 -->
    <Teleport to="body">
      <div v-if="showEditDialog" class="dlg-overlay" @click.self="showEditDialog=false">
        <div class="dlg-panel">
          <div class="dlg-title">{{ editConn.id ? '编辑' : '添加' }}场景连接</div>
          <div class="form-body">
            <label class="form-label">起始场景</label>
            <select v-model="editConn.fromId" class="field-input">
              <option value="">请选择</option>
              <option v-for="s in scenes" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <label class="form-label" style="margin-top:10px">目标场景</label>
            <select v-model="editConn.toId" class="field-input">
              <option value="">请选择</option>
              <option v-for="s in scenes" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
            <label class="form-label" style="margin-top:10px">步行时长（分钟）</label>
            <input v-model.number="editConn.walk_duration" type="number" min="1" class="field-input" />
            <label class="checkbox-row" style="margin-top:10px">
              <input v-model="editConn.is_bidirectional" type="checkbox" />
              <span>双向通行</span>
            </label>
          </div>
          <div class="dlg-footer">
            <button class="dlg-btn" @click="showEditDialog=false">取消</button>
            <button class="dlg-btn accent" :disabled="!editConn.fromId || !editConn.toId || saving" @click="saveConnection">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.scene-roadmap { display: flex; flex-direction: column; gap: var(--space-2); }
.roadmap-header { display: flex; align-items: center; justify-content: space-between; }
.roadmap-title { font-size: var(--text-xs); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1px; }
.roadmap-hint { font-size: var(--text-xs); color: var(--color-text-muted); text-align: center; padding: var(--space-3); }
.roadmap-svg-wrap { overflow-x: auto; }
.roadmap-svg { display: block; margin: 0 auto; }
.edge-line { stroke: var(--color-card-border); stroke-width: 1.5; }
.edge-label { font-size: 9px; fill: var(--color-text-muted); text-anchor: middle; font-family: var(--font-mono); }
.edge-edit { cursor: pointer; }
.node-circle { fill: var(--surface-card); stroke: var(--color-card-border); stroke-width: 1.5; }
.node-label { font-size: 10px; fill: var(--color-text-primary); text-anchor: middle; font-weight: 600; }
.conn-list { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--color-card-border); padding-top: var(--space-2); }
.conn-row { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); }
.conn-from, .conn-to { font-weight: 500; color: var(--color-text-primary); }
.conn-arrow { color: var(--color-text-muted); }
.conn-dur { color: var(--color-text-muted); flex: 1; }
.sm-btn { padding: 3px 10px; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); cursor: pointer; font-size: var(--text-xs); white-space: nowrap; }
.sm-btn.accent { background: var(--btn-primary-bg); color: var(--btn-primary-text); border-color: transparent; }
.sm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
/* 对话框 */
.dlg-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 2000; display: flex; align-items: center; justify-content: center; }
.dlg-panel { background: var(--color-card-bg); border-radius: var(--radius-lg); padding: var(--space-5); width: 320px; display: flex; flex-direction: column; gap: var(--space-3); box-shadow: 0 8px 32px rgba(0,0,0,.2); }
.dlg-title { font-size: var(--text-base); font-weight: 600; color: var(--color-text-primary); }
.dlg-footer { display: flex; justify-content: flex-end; gap: var(--space-2); }
.dlg-btn { padding: 6px 16px; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); cursor: pointer; font-size: var(--text-sm); }
.dlg-btn.accent { background: var(--btn-primary-bg); color: var(--btn-primary-text); border-color: transparent; }
.dlg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.form-body { display: flex; flex-direction: column; }
.form-label { font-size: var(--text-xs); color: var(--color-text-muted); margin-bottom: 4px; }
.field-input { width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); color: var(--color-text-primary); font-size: var(--text-sm); box-sizing: border-box; }
.checkbox-row { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); cursor: pointer; }
</style>
