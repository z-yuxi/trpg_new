<script setup lang="ts">
import { ref, computed, markRaw, nextTick, shallowRef } from 'vue';
import { VueFlow, useVueFlow, Panel } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import type { Node, Edge, Connection, EdgeMouseEvent, NodeTypesObject } from '@vue-flow/core';
import AtomLibrary from './AtomLibrary.vue';
import AtomNode from './nodes/AtomNode.vue';
import {
  ATOM_DEFINITIONS,
  serializeToGraph,
  deserializeFromGraph,
  hasCycle,
  isPortCompatible,
} from '../../utils/canvas-serializer';
import type { AtomNodeData, PortType, PortDef } from '../../utils/canvas-serializer';
import type { CommandGraph } from '@trpg/shared';
import { api } from '../../utils/api';

// ── Props & Emits ─────────────────────────────────────────────────────────
const props = defineProps<{
  /** 规则集 ID（用于预览执行） */
  rulesetId: string;
  /** 初始图数据（从后端加载） */
  initialGraph?: CommandGraph | null;
  /** 鉴权 token（用于预览请求） */
  authToken?: string;
}>();

const emit = defineEmits<{
  (e: 'update:graph', graph: CommandGraph): void;
  (e: 'save', graph: CommandGraph): void;
}>();

// ── Vue Flow 实例 ─────────────────────────────────────────────────────────
const {
  nodes,
  edges,
  addNodes,
  addEdges,
  removeNodes,
  removeEdges,
  fitView,
  zoomTo,
  viewport,
  onConnect,
  onEdgeContextMenu,
  onNodesInitialized,
} = useVueFlow();

// 注册自定义节点类型
const nodeTypes = markRaw({ atomNode: AtomNode }) as unknown as NodeTypesObject;

// ── 输出节点 ──────────────────────────────────────────────────────────────
const outputNodeId = ref('');

// ── 历史记录（撤销/重做） ──────────────────────────────────────────────────
interface HistoryEntry { nodes: Node[]; edges: Edge[]; outputNodeId: string }
const history = shallowRef<HistoryEntry[]>([]);
const historyIndex = ref(-1);
const MAX_HISTORY = 50;

function pushHistory() {
  const snapshot: HistoryEntry = {
    nodes: JSON.parse(JSON.stringify(nodes.value)),
    edges: JSON.parse(JSON.stringify(edges.value)),
    outputNodeId: outputNodeId.value,
  };
  // 删除当前位置之后的历史
  history.value = history.value.slice(0, historyIndex.value + 1);
  history.value.push(snapshot as HistoryEntry);
  if (history.value.length > MAX_HISTORY) history.value.shift();
  historyIndex.value = history.value.length - 1;
}

function undo() {
  if (historyIndex.value <= 0) return;
  historyIndex.value--;
  applyHistory(history.value[historyIndex.value]);
}

function redo() {
  if (historyIndex.value >= history.value.length - 1) return;
  historyIndex.value++;
  applyHistory(history.value[historyIndex.value]);
}

function applyHistory(entry: HistoryEntry) {
  // 清空并重置
  removeNodes(nodes.value.map((n) => n.id));
  removeEdges(edges.value.map((e) => e.id));
  nextTick(() => {
    addNodes(JSON.parse(JSON.stringify(entry.nodes)));
    addEdges(JSON.parse(JSON.stringify(entry.edges)));
    outputNodeId.value = entry.outputNodeId;
  });
}

// ── 初始加载 ─────────────────────────────────────────────────────────────
function loadGraph(graph: CommandGraph | null | undefined) {
  if (!graph || graph.nodes.length === 0) return;
  const { nodes: ns, edges: es, outputNodeId: oid } = deserializeFromGraph(graph);
  addNodes(ns);
  addEdges(es);
  outputNodeId.value = oid;
  nextTick(() => fitView({ padding: 0.2 }));
  pushHistory();
}

onNodesInitialized(() => {
  if (props.initialGraph) {
    loadGraph(props.initialGraph);
  }
});

// ── 连线校验 ─────────────────────────────────────────────────────────────
const connectionError = ref<string | null>(null);

onConnect((connection: Connection) => {
  // 端口类型兼容性检查
  const srcNode = nodes.value.find((n) => n.id === connection.source);
  const tgtNode = nodes.value.find((n) => n.id === connection.target);
  if (srcNode && tgtNode) {
    const srcDef = ATOM_DEFINITIONS[srcNode.data.atom_type];
    const tgtDef = ATOM_DEFINITIONS[tgtNode.data.atom_type];
    const srcPort: PortDef | undefined = srcDef?.outputs.find((p) => p.key === connection.sourceHandle);
    const tgtPort: PortDef | undefined = tgtDef?.inputs.find((p) => p.key === connection.targetHandle);
    if (srcPort && tgtPort && !isPortCompatible(srcPort.type as PortType, tgtPort.type as PortType)) {
      connectionError.value = `类型不匹配：${srcPort.type} → ${tgtPort.type}`;
      setTimeout(() => (connectionError.value = null), 3000);
      return;
    }
  }

  // 临时添加边，检测环路
  const testEdge: Edge = {
    id: `test-${Date.now()}`,
    source: connection.source!,
    sourceHandle: connection.sourceHandle ?? undefined,
    target: connection.target!,
    targetHandle: connection.targetHandle ?? undefined,
    type: 'smoothstep',
  };
  const testEdges = [...edges.value, testEdge];
  if (hasCycle(nodes.value, testEdges)) {
    connectionError.value = '禁止环形连接';
    setTimeout(() => (connectionError.value = null), 3000);
    return;
  }

  addEdges([testEdge]);
  pushHistory();
  emitGraph();
});

// ── 右键删除连线 ──────────────────────────────────────────────────────────
onEdgeContextMenu(({ event, edge }: EdgeMouseEvent) => {
  event.preventDefault();
  removeEdges([edge.id]);
  pushHistory();
  emitGraph();
});

// ── 从原子库添加节点 ──────────────────────────────────────────────────────
let nodeCounter = 0;
function addNodeByType(atomType: string, position?: { x: number; y: number }) {
  const id = `${atomType}_${Date.now()}_${nodeCounter++}`;
  const newNode: Node<AtomNodeData> = {
    id,
    type: 'atomNode',
    position: position ?? {
      x: 100 + (nodes.value.length % 5) * 220,
      y: 100 + Math.floor(nodes.value.length / 5) * 160,
    },
    data: {
      atom_type: atomType,
      config: {},
      collapsed: false,
      preview: null,
    },
  };
  addNodes([newNode]);
  pushHistory();
  emitGraph();

  // 如果是第一个 result_collector，自动设为输出节点
  if (atomType === 'result_collector' && !outputNodeId.value) {
    outputNodeId.value = id;
  }
}

// ── 画布拖放创建节点 ──────────────────────────────────────────────────────
const canvasWrapperRef = ref<HTMLElement | null>(null);

function onDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  const atomType = event.dataTransfer?.getData('application/atom-type');
  if (!atomType || !canvasWrapperRef.value) return;

  const rect = canvasWrapperRef.value.getBoundingClientRect();
  // 转换为画布坐标（考虑缩放和平移）
  const vp = viewport.value;
  const x = (event.clientX - rect.left - vp.x) / vp.zoom;
  const y = (event.clientY - rect.top - vp.y) / vp.zoom;
  addNodeByType(atomType, { x, y });
}

// ── 删除选中节点 ──────────────────────────────────────────────────────────
function deleteSelected() {
  const selectedNodes = nodes.value.filter((n) => n.selected);
  const selectedEdges = edges.value.filter((e) => e.selected);
  if (selectedNodes.length + selectedEdges.length === 0) return;
  removeNodes(selectedNodes.map((n) => n.id));
  removeEdges(selectedEdges.map((e) => e.id));
  pushHistory();
  emitGraph();
}

// 键盘快捷键
function onKeyDown(event: KeyboardEvent) {
  if ((event.key === 'Delete' || event.key === 'Backspace') &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLTextAreaElement)) {
    deleteSelected();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault();
    undo();
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
    event.preventDefault();
    redo();
  }
}

// ── 自动布局（横向数据流） ────────────────────────────────────────────────
function autoLayout() {
  // Kahn 算法拓扑排序
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.value.forEach((n) => { inDegree.set(n.id, 0); adj.set(n.id, []); });
  edges.value.forEach((e) => {
    adj.get(e.source)!.push(e.target);
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  });
  const queue = nodes.value.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const levels = new Map<string, number>();
  let level = 0;
  while (queue.length > 0) {
    const current = [...queue];
    queue.length = 0;
    current.forEach((id) => {
      levels.set(id, level);
      adj.get(id)!.forEach((next) => {
        inDegree.set(next, (inDegree.get(next) ?? 1) - 1);
        if (inDegree.get(next) === 0) queue.push(next);
      });
    });
    level++;
  }
  // 按层排列
  const levelGroups = new Map<number, string[]>();
  levels.forEach((lv, id) => {
    if (!levelGroups.has(lv)) levelGroups.set(lv, []);
    levelGroups.get(lv)!.push(id);
  });
  levelGroups.forEach((ids, lv) => {
    ids.forEach((id, i) => {
      const node = nodes.value.find((n) => n.id === id);
      if (node) {
        node.position = { x: lv * 260, y: i * 160 };
      }
    });
  });
  nextTick(() => fitView({ padding: 0.2 }));
  pushHistory();
}

// ── 序列化并向父组件发送更新 ──────────────────────────────────────────────
function emitGraph() {
  if (!outputNodeId.value && nodes.value.length > 0) {
    // 自动选最后一个 result_collector 作输出节点
    const collector = [...nodes.value].reverse().find((n) => n.data.atom_type === 'result_collector');
    if (collector) outputNodeId.value = collector.id;
  }
  if (!outputNodeId.value) return;
  const graph = serializeToGraph(nodes.value as Node<AtomNodeData>[], edges.value, outputNodeId.value);
  emit('update:graph', graph);
  runTopologyValidation();
}

// ── 拓扑校验（实时） ──────────────────────────────────────────────────────
export interface ValidationIssue {
  type: 'error' | 'warning';
  node_id?: string;
  message: string;
}

const validationIssues = ref<ValidationIssue[]>([]);
const showValidationPanel = ref(false);

function runTopologyValidation() {
  if (nodes.value.length === 0) {
    validationIssues.value = [];
    return;
  }
  const issues: ValidationIssue[] = [];
  const connectedNodes = new Set<string>();
  edges.value.forEach((e) => { connectedNodes.add(e.source); connectedNodes.add(e.target); });

  // 1. 孤立节点（无连线且节点总数 > 1）
  if (nodes.value.length > 1) {
    for (const n of nodes.value) {
      if (!connectedNodes.has(n.id)) {
        issues.push({ type: 'warning', node_id: n.id, message: `节点「${ATOM_DEFINITIONS[n.data?.atom_type]?.label ?? n.id}」未连接任何边（孤立节点）` });
      }
    }
  }

  // 2. 必需输入端口缺失
  for (const n of nodes.value) {
    const def = ATOM_DEFINITIONS[n.data?.atom_type];
    if (!def) continue;
    for (const port of def.inputs) {
      if (!port.required) continue;
      const hasEdge = edges.value.some((e) => e.target === n.id && e.targetHandle === port.key);
      const hasStatic = n.data?.config?.[port.key]?.type === 'static' && (n.data.config[port.key] as any).value !== '';
      if (!hasEdge && !hasStatic) {
        issues.push({ type: 'error', node_id: n.id, message: `节点「${def.label}」必需输入「${port.label}」未设置` });
      }
    }
  }

  // 3. 输出节点唯一性（result_collector 数量应 >= 1，且有 output_node_id 指向）
  const collectors = nodes.value.filter((n) => n.data?.atom_type === 'result_collector');
  if (collectors.length === 0) {
    issues.push({ type: 'error', message: '缺少结果收集节点（result_collector），请添加至少一个' });
  } else if (!outputNodeId.value) {
    issues.push({ type: 'error', message: '尚未设置输出节点，请在工具栏选择' });
  }

  validationIssues.value = issues;
  // 有错误时自动展开校验面板
  if (issues.some((i) => i.type === 'error')) {
    showValidationPanel.value = true;
  }
}

// ── 预览执行 ─────────────────────────────────────────────────────────────
const showPreviewPanel = ref(false);
const previewCommand = ref('/r 1d6');
const mockAttrRaw = ref('{"力量": 60}');
const mockSkillRaw = ref('{"侦查": 70}');
const mockResourceRaw = ref('{"HP": {"current": 10, "max": 14}}');
const previewRunning = ref(false);
const previewError = ref<string | null>(null);

async function runPreview() {
  if (!props.rulesetId || props.rulesetId === 'new') return;
  previewRunning.value = true;
  previewError.value = null;
  // 清除所有节点预览值和边的动画样式
  nodes.value.forEach((n) => { if (n.data) n.data.preview = null; });
  edges.value.forEach((e) => { (e as any).animated = false; (e as any).style = {}; });
  try {
    let attributes: Record<string, number> = {};
    let skills: Record<string, number> = {};
    let resources: Record<string, { current: number; max: number }> = {};
    try { attributes = JSON.parse(mockAttrRaw.value); } catch { /**/ }
    try { skills = JSON.parse(mockSkillRaw.value); } catch { /**/ }
    try { resources = JSON.parse(mockResourceRaw.value); } catch { /**/ }

    const data = await api.post<{ logs?: Array<{ node_id: string; output: unknown }> }>(
      `/rulesets/${props.rulesetId}/execute`,
      {
        command: previewCommand.value,
        mock_context: { attributes, skills, resources },
      },
    );

    // 将执行日志注入到对应节点的 preview
    const executedNodeIds = new Set<string>();
    for (const log of data.logs ?? []) {
      const node = nodes.value.find((n) => n.id === log.node_id);
      if (node && node.data) {
        node.data = { ...node.data, preview: log.output };
        executedNodeIds.add(log.node_id);
      }
    }

    // 数据流动画：已执行的节点间连线高亮绿色，其余灰显
    edges.value.forEach((e) => {
      const srcExecuted = executedNodeIds.has(e.source);
      const tgtExecuted = executedNodeIds.has(e.target);
      if (srcExecuted && tgtExecuted) {
        (e as any).animated = true;
        (e as any).style = { stroke: '#27ae60', strokeWidth: 2 };
      } else {
        (e as any).animated = false;
        (e as any).style = { stroke: '#555', strokeWidth: 1, opacity: 0.4 };
      }
    });
  } catch (e) {
    previewError.value = String(e);
  } finally {
    previewRunning.value = false;
  }
}

// ── 缩放显示 ─────────────────────────────────────────────────────────────
const zoomPercent = computed(() => Math.round((viewport.value.zoom ?? 1) * 100));

// ── 设置输出节点 ──────────────────────────────────────────────────────────
function setOutputNode(id: string) {
  outputNodeId.value = id;
  emitGraph();
}

// 对外暴露（供 RulesetEditor 调用）
defineExpose({
  loadGraph,
  getGraph: () =>
    outputNodeId.value
      ? serializeToGraph(nodes.value as Node<AtomNodeData>[], edges.value, outputNodeId.value)
      : null,
  fitView: () => fitView({ padding: 0.2 }),
});
</script>

<template>
  <div class="rule-canvas" @keydown="onKeyDown" tabindex="0">
    <!-- 工具栏 -->
    <div class="rule-canvas__toolbar">
      <div class="toolbar-left">
        <button class="toolbar-btn" @click="undo" title="撤销 (Ctrl+Z)">↩ 撤销</button>
        <button class="toolbar-btn" @click="redo" title="重做 (Ctrl+Y)">↪ 重做</button>
        <button class="toolbar-btn" @click="autoLayout" title="自动排列节点">⬡ 自动布局</button>
        <button class="toolbar-btn" @click="fitView({ padding: 0.2 })" title="适应画面">⊞ 适应</button>
      </div>
      <div class="toolbar-center">
        <span class="toolbar-zoom">{{ zoomPercent }}%</span>
        <input
          type="range" min="25" max="400" step="5"
          :value="zoomPercent"
          class="toolbar-zoom-slider"
          @input="(e) => zoomTo(Number((e.target as HTMLInputElement).value) / 100)"
        />
      </div>
      <div class="toolbar-right">
        <div class="output-node-selector" v-if="nodes.length > 0">
          <label class="toolbar-label">输出节点：</label>
          <select
            class="toolbar-select"
            :value="outputNodeId"
            @change="setOutputNode(($event.target as HTMLSelectElement).value)"
          >
            <option value="">— 选择输出节点 —</option>
            <option v-for="n in nodes" :key="n.id" :value="n.id">
              {{ ATOM_DEFINITIONS[n.data?.atom_type]?.label ?? n.data?.atom_type }} ({{ n.id.slice(0, 8) }})
            </option>
          </select>
        </div>
        <button class="toolbar-btn toolbar-btn--primary" @click="showPreviewPanel = !showPreviewPanel">
          ▶ 预览执行
        </button>
        <button
          class="toolbar-btn"
          :class="validationIssues.some(i => i.type === 'error') ? 'toolbar-btn--danger' : ''"
          @click="runTopologyValidation(); showValidationPanel = true"
          title="运行拓扑校验"
        >
          ✓ 校验
          <span v-if="validationIssues.length > 0" class="toolbar-badge">{{ validationIssues.length }}</span>
        </button>
        <button class="toolbar-btn toolbar-btn--danger" @click="deleteSelected" title="删除选中 (Delete)">
          🗑 删除
        </button>
      </div>
    </div>

    <!-- 三栏主体 -->
    <div class="rule-canvas__body">
      <!-- 左：原子库 -->
      <div class="rule-canvas__sidebar">
        <AtomLibrary @add-node="addNodeByType" />
      </div>

      <!-- 中：画布 -->
      <div
        ref="canvasWrapperRef"
        class="rule-canvas__flow"
        @dragover="onDragOver"
        @drop="onDrop"
      >
        <VueFlow
          :node-types="nodeTypes"
          :nodes="nodes"
          :edges="edges"
          :snap-to-grid="true"
          :snap-grid="[20, 20]"
          :min-zoom="0.25"
          :max-zoom="4"
          fit-view-on-init
          @nodes-change="emitGraph"
          @edges-change="emitGraph"
        >
          <Background pattern-color="var(--color-border, #2a2a3e)" />
          <MiniMap
            class="rule-canvas__minimap"
            node-color="var(--color-primary, #7b68ee)"
          />
          <Controls class="rule-canvas__controls" />

          <!-- 空状态提示 -->
          <Panel position="top-center" v-if="nodes.length === 0">
            <div class="canvas-empty">
              从左侧原子库拖拽节点到此处，或双击原子卡片快速添加
            </div>
          </Panel>

          <!-- 错误提示 -->
          <Panel position="bottom-center" v-if="connectionError">
            <div class="canvas-error">⚠ {{ connectionError }}</div>
          </Panel>

          <!-- 拓扑校验结果面板 -->
          <Panel position="bottom-left" v-if="validationIssues.length > 0">
            <div class="validation-panel" :class="{ collapsed: !showValidationPanel }">
              <div class="validation-panel__header" @click="showValidationPanel = !showValidationPanel">
                <span :class="validationIssues.some(i => i.type === 'error') ? 'val-error-icon' : 'val-warn-icon'">
                  {{ validationIssues.some(i => i.type === 'error') ? '✕' : '⚠' }}
                  {{ validationIssues.filter(i => i.type === 'error').length }} 错误
                  {{ validationIssues.filter(i => i.type === 'warning').length }} 警告
                </span>
                <span class="val-toggle">{{ showValidationPanel ? '▼' : '▲' }}</span>
              </div>
              <ul v-if="showValidationPanel" class="validation-panel__list">
                <li
                  v-for="(issue, idx) in validationIssues"
                  :key="idx"
                  class="validation-item"
                  :class="issue.type === 'error' ? 'validation-item--error' : 'validation-item--warning'"
                >
                  {{ issue.message }}
                </li>
              </ul>
            </div>
          </Panel>
        </VueFlow>
      </div>

      <!-- 右：预览面板（可选显示） -->
      <div v-if="showPreviewPanel" class="rule-canvas__props">
        <div class="preview-panel">
          <div class="preview-panel__header">
            <h4>预览执行</h4>
            <button class="rm-btn" @click="showPreviewPanel = false">×</button>
          </div>
          <div class="preview-panel__body">
            <label class="preview-label">命令</label>
            <input v-model="previewCommand" class="preview-input" placeholder="/r 1d6" />

            <label class="preview-label">模拟属性 (JSON)</label>
            <textarea v-model="mockAttrRaw" class="preview-textarea" rows="3" />

            <label class="preview-label">模拟技能 (JSON)</label>
            <textarea v-model="mockSkillRaw" class="preview-textarea" rows="3" />

            <label class="preview-label">模拟资源 (JSON)</label>
            <textarea v-model="mockResourceRaw" class="preview-textarea" rows="3" />

            <button
              class="preview-run-btn"
              :disabled="previewRunning"
              @click="runPreview"
            >
              {{ previewRunning ? '执行中…' : '▶ 执行' }}
            </button>

            <div v-if="previewError" class="preview-error">{{ previewError }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rule-canvas {
  display: flex;
  flex-direction: column;
  height: 100%;
  outline: none;
  background: var(--color-bg-main, #12121a);
}

/* ── 工具栏 ── */
.rule-canvas__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--color-bg-sidebar, #16161e);
  border-bottom: 1px solid var(--color-border, #2a2a3e);
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-center, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-btn {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--color-bg-card, #1e1e2e);
  color: var(--color-text-primary, #e0e0e0);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s;
  white-space: nowrap;
}

.toolbar-btn:hover { background: var(--color-bg-hover, #2a2a3e); }

.toolbar-btn--primary {
  background: var(--color-primary, #7b68ee);
  border-color: var(--color-primary, #7b68ee);
  color: #fff;
}

.toolbar-btn--primary:hover { opacity: 0.85; }

.toolbar-btn--danger {
  border-color: var(--color-error, #e74c3c);
  color: var(--color-error, #e74c3c);
}

.toolbar-btn--danger:hover { background: color-mix(in srgb, var(--color-error, #e74c3c) 15%, transparent); }

.toolbar-zoom { font-size: 12px; color: var(--color-text-secondary, #888); min-width: 38px; text-align: right; }

.toolbar-zoom-slider {
  width: 80px;
  accent-color: var(--color-primary, #7b68ee);
}

.toolbar-label { font-size: 12px; color: var(--color-text-secondary, #888); }

.toolbar-select {
  font-size: 12px;
  padding: 3px 6px;
  background: var(--color-bg-input, #2a2a3e);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  color: var(--color-text-primary, #e0e0e0);
  max-width: 200px;
}

.output-node-selector {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ── 三栏 ── */
.rule-canvas__body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.rule-canvas__sidebar {
  width: 240px;
  flex-shrink: 0;
  overflow: hidden;
}

.rule-canvas__flow {
  flex: 1;
  overflow: hidden;
}

.rule-canvas__props {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  background: var(--color-bg-sidebar, #16161e);
  border-left: 1px solid var(--color-border, #2a2a3e);
}

/* ── 画布内提示 ── */
.canvas-empty {
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 6px;
  color: var(--color-text-secondary, #888);
  font-size: 13px;
  pointer-events: none;
  text-align: center;
}

.canvas-error {
  padding: 8px 16px;
  background: var(--color-error, #e74c3c);
  color: #fff;
  border-radius: 6px;
  font-size: 13px;
}

/* ── 预览面板 ── */
.preview-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preview-panel__header h4 {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #e0e0e0);
  margin: 0;
}

.preview-panel__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-label {
  font-size: 11px;
  color: var(--color-text-secondary, #888);
  display: block;
}

.preview-input {
  width: 100%;
  padding: 5px 8px;
  background: var(--color-bg-input, #2a2a3e);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  color: var(--color-text-primary, #e0e0e0);
  font-size: 12px;
  box-sizing: border-box;
}

.preview-textarea {
  width: 100%;
  padding: 5px 8px;
  background: var(--color-bg-input, #2a2a3e);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  color: var(--color-text-primary, #e0e0e0);
  font-size: 11px;
  font-family: monospace;
  resize: vertical;
  box-sizing: border-box;
}

.preview-run-btn {
  width: 100%;
  padding: 7px;
  background: var(--color-primary, #7b68ee);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: opacity 0.12s;
}

.preview-run-btn:hover { opacity: 0.85; }
.preview-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.preview-error {
  padding: 6px 8px;
  background: color-mix(in srgb, var(--color-error, #e74c3c) 20%, transparent);
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-error, #e74c3c);
}

.rm-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary, #888);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 6px;
}

.rm-btn:hover { color: var(--color-error, #e74c3c); }

/* ── 拓扑校验面板 ── */
.validation-panel {
  min-width: 260px;
  max-width: 360px;
  background: var(--color-bg-sidebar, #16161e);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.validation-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--color-bg-card, #1e1e2e);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  user-select: none;
}

.val-error-icon { color: var(--color-error, #e74c3c); }
.val-warn-icon { color: #f5a623; }
.val-toggle { color: var(--color-text-secondary, #888); font-size: 10px; }

.validation-panel__list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 180px;
  overflow-y: auto;
}

.validation-item {
  padding: 4px 10px;
  font-size: 11px;
  border-left: 3px solid transparent;
  color: var(--color-text-primary, #e0e0e0);
}

.validation-item--error {
  border-color: var(--color-error, #e74c3c);
  background: color-mix(in srgb, var(--color-error, #e74c3c) 10%, transparent);
}

.validation-item--warning {
  border-color: #f5a623;
  background: color-mix(in srgb, #f5a623 10%, transparent);
}

/* 工具栏徽章 */
.toolbar-badge {
  display: inline-block;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  border-radius: 8px;
  background: var(--color-error, #e74c3c);
  color: #fff;
  font-size: 10px;
  text-align: center;
  padding: 0 4px;
  margin-left: 4px;
}
</style>
