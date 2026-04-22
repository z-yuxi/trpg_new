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
  project,
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

  // 无位置时：将节点放置到当前视口中心
  let resolvedPosition = position;
  if (!resolvedPosition) {
    const wrapper = canvasWrapperRef.value;
    if (wrapper) {
      const cx = wrapper.clientWidth / 2;
      const cy = wrapper.clientHeight / 2;
      resolvedPosition = project({ x: cx, y: cy });
    } else {
      resolvedPosition = { x: 100 + (nodes.value.length % 5) * 220, y: 100 + Math.floor(nodes.value.length / 5) * 160 };
    }
    // 小偶尔偏移避免堆叠
    resolvedPosition = { x: resolvedPosition.x + (nodes.value.length % 3) * 30 - 30, y: resolvedPosition.y + Math.floor(nodes.value.length / 3) * 30 - 30 };
  }
  const newNode: Node<AtomNodeData> = {
    id,
    type: 'atomNode',
    position: resolvedPosition,
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
const previewRunning = ref(false);
const previewError = ref<string | null>(null);

// 结构化模拟角色数据
interface MockAttr { name: string; value: number }
const mockAttrs = ref<MockAttr[]>([
  { name: '力量', value: 60 },
  { name: '体质', value: 55 },
]);
const mockSkills = ref<MockAttr[]>([
  { name: '侦查', value: 70 },
]);
interface MockResource { name: string; current: number; max: number }
const mockResources = ref<MockResource[]>([
  { name: 'HP', current: 10, max: 14 },
]);

function addMockAttr() { mockAttrs.value.push({ name: '', value: 0 }); }
function removeMockAttr(i: number) { mockAttrs.value.splice(i, 1); }
function addMockSkill() { mockSkills.value.push({ name: '', value: 0 }); }
function removeMockSkill(i: number) { mockSkills.value.splice(i, 1); }
function addMockResource() { mockResources.value.push({ name: '', current: 0, max: 0 }); }
function removeMockResource(i: number) { mockResources.value.splice(i, 1); }

// 执行结果
interface PreviewLog { node_id: string; atom_type?: string; inputs?: unknown; output?: unknown; duration_ms?: number; }
interface PreviewResult {
  success?: boolean;
  result?: string;
  output?: unknown;
  logs?: PreviewLog[];
  dice_rolls?: Array<{ expression: string; value: number; detail?: string }>;
}
const previewResult = ref<PreviewResult | null>(null);

/** 从图中自动生成 mock 数据（读取所有 character_skill_reader 节点所需字段） */
function autoGenerateMock() {
  const existingAttrs = new Set(mockAttrs.value.map((a) => a.name));
  const existingSkills = new Set(mockSkills.value.map((s) => s.name));

  for (const node of nodes.value) {
    if ((node.data as any)?.atom_type === 'character_skill_reader') {
      const config = (node.data as any)?.config ?? {};
      const fieldName = config['field_name']?.value as string | undefined;
      const fieldType = (config['field_type']?.value as string) ?? 'skill';
      if (fieldName) {
        if (fieldType === 'attribute' && !existingAttrs.has(fieldName)) {
          mockAttrs.value.push({ name: fieldName, value: 50 });
          existingAttrs.add(fieldName);
        } else if (fieldType !== 'attribute' && !existingSkills.has(fieldName)) {
          mockSkills.value.push({ name: fieldName, value: 50 });
          existingSkills.add(fieldName);
        }
      }
    }
  }
}

async function runPreview() {
  if (!props.rulesetId || props.rulesetId === 'new') return;
  previewRunning.value = true;
  previewError.value = null;
  previewResult.value = null;
  // 清除所有节点预览值和边的动画样式
  nodes.value.forEach((n) => { if (n.data) n.data.preview = null; });
  edges.value.forEach((e) => { (e as any).animated = false; (e as any).style = {}; });

  // 预检：确认 character_skill_reader 节点所需字段已在 mock 数据中存在
  const mockAttrNames = new Set(mockAttrs.value.filter((a) => a.name).map((a) => a.name));
  const mockSkillNames = new Set(mockSkills.value.filter((s) => s.name).map((s) => s.name));
  const mockResourceNames = new Set(mockResources.value.filter((r) => r.name).map((r) => r.name));
  const missingFields: string[] = [];

  for (const node of nodes.value) {
    if ((node.data as any)?.atom_type === 'character_skill_reader') {
      const config = (node.data as any)?.config ?? {};
      const fieldName = config['field_name']?.value as string | undefined;
      const fieldType = (config['field_type']?.value as string) ?? 'skill';
      if (fieldName) {
        const allMock = new Set([...mockAttrNames, ...mockSkillNames, ...mockResourceNames]);
        if (fieldType === 'attribute' && !mockAttrNames.has(fieldName) && !allMock.has(fieldName)) {
          missingFields.push(`属性"${fieldName}"`);
        } else if ((fieldType === 'skill') && !mockSkillNames.has(fieldName) && !allMock.has(fieldName)) {
          missingFields.push(`技能"${fieldName}"`);
        } else if (fieldType.startsWith('resource') && !mockResourceNames.has(fieldName)) {
          missingFields.push(`资源"${fieldName}"`);
        }
      }
    }
  }

  if (missingFields.length > 0) {
    previewError.value = `模拟数据缺少以下字段：${missingFields.join('、')}。请在下方添加或点击「自动生成」。`;
    previewRunning.value = false;
    return;
  }

  try {
    const attributes: Record<string, number> = {};
    const skills: Record<string, number> = {};
    const resources: Record<string, { current: number; max: number }> = {};
    mockAttrs.value.forEach((a) => { if (a.name) attributes[a.name] = a.value; });
    mockSkills.value.forEach((s) => { if (s.name) skills[s.name] = s.value; });
    mockResources.value.forEach((r) => { if (r.name) resources[r.name] = { current: r.current, max: r.max }; });

    const data = await api.post<PreviewResult>(
      `/rulesets/${props.rulesetId}/execute`,
      {
        command: previewCommand.value,
        mock_context: { attributes, skills, resources },
      },
    );

    // 处理后端结构化错误
    if (data && (data as any).success === false && (data as any).error) {
      const errMsg = (data as any).error as string;
      previewError.value = errMsg;
      // 解析错误中的 node_id（格式："Node 'xxx' (yyy) threw: zzz"）
      const nodeMatch = errMsg.match(/Node '([^']+)'/);
      if (nodeMatch) {
        const errorNodeId = nodeMatch[1];
        const errNode = nodes.value.find((n) => n.id === errorNodeId);
        if (errNode) {
          errNode.data = { ...errNode.data, hasError: true, errorMessage: errMsg } as any;
        }
        edges.value.forEach((e) => {
          if (e.target === errorNodeId) {
            (e as any).style = { stroke: '#e74c3c', strokeWidth: 2, strokeDasharray: '5,5' };
          }
        });
      }
      return;
    }

    previewResult.value = data;

    // 将执行日志注入到对应节点的 preview
    const executedNodeIds = new Set<string>();
    for (const log of data.logs ?? []) {
      const node = nodes.value.find((n) => n.id === log.node_id);
      if (node && node.data) {
        node.data = { ...node.data, preview: log.output } as any;
        executedNodeIds.add(log.node_id);
      }
    }

    // 数据流动画
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
    previewError.value = (e instanceof Error) ? e.message : String(e);
  } finally {
    previewRunning.value = false;
  }
}

function clearPreviewResult() {
  previewResult.value = null;
  previewError.value = null;
  nodes.value.forEach((n) => { if (n.data) { (n.data as any).preview = null; (n.data as any).hasError = false; } });
  edges.value.forEach((e) => { (e as any).animated = false; (e as any).style = {}; });
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
          :default-viewport="{ x: 0, y: 0, zoom: 1 }"
          @nodes-change="emitGraph"
          @edges-change="emitGraph"
          @dragover="onDragOver"
          @drop="onDrop"
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
            <!-- 命令输入 -->
            <label class="preview-label">测试命令</label>
            <input v-model="previewCommand" class="preview-input" placeholder="/r 1d6" />

            <!-- 模拟属性 -->
            <div class="preview-section">
              <div class="preview-section-header">
                <span class="preview-label">模拟属性</span>
                <button class="preview-add-btn" @click="addMockAttr">+ 添加</button>
              </div>
              <div v-for="(attr, i) in mockAttrs" :key="i" class="preview-row">
                <input v-model="attr.name" class="preview-row-name" placeholder="属性名" />
                <input v-model.number="attr.value" type="number" class="preview-row-val" />
                <button class="preview-rm-btn" @click="removeMockAttr(i)">×</button>
              </div>
            </div>

            <!-- 模拟技能 -->
            <div class="preview-section">
              <div class="preview-section-header">
                <span class="preview-label">模拟技能</span>
                <button class="preview-add-btn" @click="addMockSkill">+ 添加</button>
              </div>
              <div v-for="(sk, i) in mockSkills" :key="i" class="preview-row">
                <input v-model="sk.name" class="preview-row-name" placeholder="技能名" />
                <input v-model.number="sk.value" type="number" class="preview-row-val" />
                <button class="preview-rm-btn" @click="removeMockSkill(i)">×</button>
              </div>
            </div>

            <!-- 模拟资源 -->
            <div class="preview-section">
              <div class="preview-section-header">
                <span class="preview-label">模拟资源</span>
                <button class="preview-add-btn" @click="addMockResource">+ 添加</button>
              </div>
              <div v-for="(res, i) in mockResources" :key="i" class="preview-row">
                <input v-model="res.name" class="preview-row-name" placeholder="资源名" />
                <input v-model.number="res.current" type="number" class="preview-row-val" placeholder="当前" />
                <span class="preview-row-sep">/</span>
                <input v-model.number="res.max" type="number" class="preview-row-val" placeholder="最大" />
                <button class="preview-rm-btn" @click="removeMockResource(i)">×</button>
              </div>
            </div>

            <div class="preview-actions">
              <button class="preview-auto-btn" @click="autoGenerateMock" title="从图中自动提取所需字段并填入默认值50">
                ⚡ 自动生成
              </button>
              <button
                class="preview-run-btn"
                :disabled="previewRunning"
                @click="runPreview"
              >
                {{ previewRunning ? '执行中…' : '▶ 执行' }}
              </button>
              <button v-if="previewResult || previewError" class="preview-clear-btn" @click="clearPreviewResult">
                ✕ 清除
              </button>
            </div>

            <div v-if="previewError" class="preview-error">{{ previewError }}</div>

            <!-- 执行结果 -->
            <template v-if="previewResult">
              <div class="preview-result-block" :class="previewResult.success === false ? 'preview-result-block--fail' : 'preview-result-block--ok'">
                <div class="preview-result-label">执行结果</div>
                <div class="preview-result-text">{{ previewResult.result ?? (previewResult.success ? '成功' : '失败') }}</div>
              </div>

              <!-- 骰点记录 -->
              <template v-if="previewResult.dice_rolls?.length">
                <div class="preview-label preview-label--mt">骰点过程</div>
                <table class="preview-table">
                  <thead><tr><th>表达式</th><th>结果</th></tr></thead>
                  <tbody>
                    <tr v-for="(dr, i) in previewResult.dice_rolls" :key="i">
                      <td>{{ dr.expression }}</td>
                      <td class="preview-dice-val">{{ dr.value }}</td>
                    </tr>
                  </tbody>
                </table>
              </template>

              <!-- 节点日志 -->
              <template v-if="previewResult.logs?.length">
                <div class="preview-label preview-label--mt">节点日志 ({{ previewResult.logs.length }} 步)</div>
                <div v-for="(log, i) in previewResult.logs" :key="i" class="preview-log-row">
                  <span class="preview-log-node">{{ ATOM_DEFINITIONS[log.atom_type ?? '']?.label ?? log.node_id }}</span>
                  <span class="preview-log-output">→ {{ JSON.stringify(log.output) }}</span>
                </div>
              </template>
            </template>
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
  position: relative;
  min-height: 0;
}

/* 强制 VueFlow 根 div 填满容器 */
.rule-canvas__flow :deep(.vue-flow) {
  width: 100%;
  height: 100%;
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

.preview-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.preview-run-btn {
  flex: 1;
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

.preview-auto-btn {
  padding: 7px 10px;
  background: var(--color-bg-card, #1e1e2e);
  color: var(--color-text-secondary, #aaa);
  border: 1px solid var(--color-border, #333);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
  transition: all 0.12s;
}
.preview-auto-btn:hover { color: var(--color-primary, #7b68ee); border-color: var(--color-primary, #7b68ee); }

.preview-clear-btn {
  padding: 7px 10px;
  background: none;
  color: var(--color-text-secondary, #888);
  border: 1px solid var(--color-border, #333);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.12s;
}
.preview-clear-btn:hover { color: var(--color-error, #e74c3c); border-color: var(--color-error, #e74c3c); }

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

/* ── 预览面板 - 结构化输入 ── */
.preview-section { display: flex; flex-direction: column; gap: 4px; }
.preview-section-header { display: flex; align-items: center; justify-content: space-between; }
.preview-add-btn {
  font-size: 11px; padding: 1px 6px;
  background: none; border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 3px; color: var(--color-text-secondary, #888); cursor: pointer;
}
.preview-add-btn:hover { color: var(--color-primary, #7b68ee); border-color: var(--color-primary, #7b68ee); }

.preview-row { display: flex; align-items: center; gap: 4px; }
.preview-row-name { flex: 1; min-width: 0; padding: 3px 6px; background: var(--color-bg-input, #2a2a3e); border: 1px solid var(--color-border, #3a3a4e); border-radius: 3px; color: var(--color-text-primary, #e0e0e0); font-size: 12px; }
.preview-row-val { width: 56px; flex-shrink: 0; padding: 3px 6px; background: var(--color-bg-input, #2a2a3e); border: 1px solid var(--color-border, #3a3a4e); border-radius: 3px; color: var(--color-text-primary, #e0e0e0); font-size: 12px; }
.preview-row-sep { color: var(--color-text-secondary, #888); font-size: 12px; }
.preview-rm-btn { background: none; border: none; color: var(--color-text-secondary, #888); cursor: pointer; font-size: 14px; padding: 0 2px; flex-shrink: 0; }
.preview-rm-btn:hover { color: var(--color-error, #e74c3c); }

/* ── 预览结果展示 ── */
.preview-label--mt { margin-top: 8px; }
.preview-result-block {
  padding: 8px 10px; border-radius: 6px; border-left: 3px solid;
}
.preview-result-block--ok { background: rgba(39, 174, 96, 0.12); border-color: #27ae60; }
.preview-result-block--fail { background: rgba(231, 76, 60, 0.12); border-color: #e74c3c; }
.preview-result-label { font-size: 10px; color: var(--color-text-secondary, #888); margin-bottom: 2px; }
.preview-result-text { font-size: 13px; font-weight: 600; color: var(--color-text-primary, #e0e0e0); }

.preview-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.preview-table th { color: var(--color-text-secondary, #888); font-weight: 500; padding: 2px 4px; border-bottom: 1px solid var(--color-border, #3a3a4e); text-align: left; }
.preview-table td { padding: 2px 4px; color: var(--color-text-primary, #e0e0e0); }
.preview-dice-val { font-weight: 600; color: var(--node-accent, #7b68ee); }

.preview-log-row { display: flex; gap: 6px; font-size: 11px; padding: 2px 0; border-bottom: 1px solid var(--color-border, #2a2a3e); }
.preview-log-node { color: var(--color-text-secondary, #888); flex-shrink: 0; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-log-output { color: var(--color-text-primary, #e0e0e0); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
