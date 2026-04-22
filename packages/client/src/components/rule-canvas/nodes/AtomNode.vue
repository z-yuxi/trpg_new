<script setup lang="ts">
import { computed, ref } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import { ATOM_DEFINITIONS } from '../../../utils/canvas-serializer';
import type { AtomNodeData, PortType } from '../../../utils/canvas-serializer';

// Vue Flow 自定义节点的 props 约定
const props = defineProps<{
  id: string;
  data: AtomNodeData;
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:data', val: AtomNodeData): void;
}>();

const def = computed(() => ATOM_DEFINITIONS[props.data.atom_type]);
const collapsed = computed(() => props.data.collapsed ?? false);

function toggleCollapse() {
  emit('update:data', { ...props.data, collapsed: !props.data.collapsed });
}

/** 端口颜色：按类型区分 */
const PORT_COLORS: Record<PortType, string> = {
  number: 'var(--color-port-number, #4a90e2)',
  boolean: 'var(--color-port-boolean, #7ed321)',
  string: 'var(--color-port-string, #f5a623)',
  any: 'var(--color-port-any, #9b59b6)',
};

function portColor(type: PortType) {
  return PORT_COLORS[type] ?? PORT_COLORS.any;
}

/** 编辑静态输入值（仅 static 类型） */
const editingKey = ref<string | null>(null);

function getStaticValue(key: string): unknown {
  const src = props.data.config?.[key];
  return src?.type === 'static' ? src.value : '';
}

function setStaticValue(key: string, val: string) {
  const newConfig = {
    ...props.data.config,
    [key]: { type: 'static' as const, value: val },
  };
  emit('update:data', { ...props.data, config: newConfig });
}

function isRefInput(key: string): boolean {
  return props.data.config?.[key]?.type === 'ref';
}

const categoryColors: Record<string, string> = {
  data: '#4a90e2',
  compute: '#7b68ee',
  logic: '#f39c12',
  effect: '#e74c3c',
  output: '#27ae60',
};
</script>

<template>
  <div
    class="atom-node"
    :class="{
      'atom-node--selected': selected,
      'atom-node--collapsed': collapsed,
    }"
    :style="{
      '--node-accent': categoryColors[def?.category ?? 'compute'],
    }"
  >
    <!-- 标题栏 -->
    <div class="atom-node__header" @dblclick="toggleCollapse">
      <span class="atom-node__icon">{{ def?.icon ?? '⚙️' }}</span>
      <span class="atom-node__label">{{ def?.label ?? data.atom_type }}</span>
      <span class="atom-node__collapse-btn">{{ collapsed ? '▶' : '▼' }}</span>
    </div>

    <!-- 端口区域（折叠时仍显示端口以便连线） -->
    <div class="atom-node__body" v-if="!collapsed">
      <!-- 输入端口 -->
      <div class="atom-node__ports atom-node__ports--inputs">
        <div
          v-for="port in def?.inputs ?? []"
          :key="port.key"
          class="atom-node__port-row"
        >
          <Handle
            :id="port.key"
            type="target"
            :position="Position.Left"
            class="atom-node__handle"
            :style="{ background: portColor(port.type) }"
          />
          <div class="atom-node__port-info">
            <span class="atom-node__port-label">{{ port.label }}</span>
            <span class="atom-node__port-type" :style="{ color: portColor(port.type) }">
              {{ port.type }}
            </span>
          </div>
          <!-- 静态值编辑器（未被连线时显示） -->
          <input
            v-if="!isRefInput(port.key)"
            class="atom-node__static-input"
            :value="String(getStaticValue(port.key) ?? '')"
            :placeholder="port.key"
            @focus="editingKey = port.key"
            @blur="editingKey = null"
            @change="(e) => setStaticValue(port.key, (e.target as HTMLInputElement).value)"
          />
          <span v-else class="atom-node__ref-badge">← 引用</span>
        </div>
      </div>

      <!-- 预览值（运行后显示） -->
      <div v-if="data.preview" class="atom-node__preview">
        <div v-for="(val, key) in data.preview" :key="key" class="atom-node__preview-row">
          <span class="atom-node__preview-key">{{ key }}:</span>
          <span class="atom-node__preview-val">{{ val }}</span>
        </div>
      </div>

      <!-- 输出端口 -->
      <div class="atom-node__ports atom-node__ports--outputs">
        <div
          v-for="port in def?.outputs ?? []"
          :key="port.key"
          class="atom-node__port-row atom-node__port-row--output"
        >
          <span class="atom-node__port-label">{{ port.label }}</span>
          <span class="atom-node__port-type" :style="{ color: portColor(port.type) }">
            {{ port.type }}
          </span>
          <Handle
            :id="port.key"
            type="source"
            :position="Position.Right"
            class="atom-node__handle"
            :style="{ background: portColor(port.type) }"
          />
        </div>
      </div>
    </div>

    <!-- 折叠态：仅显示端口 handle -->
    <div v-else class="atom-node__collapsed-ports">
      <Handle
        v-for="port in def?.inputs ?? []"
        :key="'in-' + port.key"
        :id="port.key"
        type="target"
        :position="Position.Left"
        class="atom-node__handle"
        :style="{ background: portColor(port.type) }"
      />
      <Handle
        v-for="port in def?.outputs ?? []"
        :key="'out-' + port.key"
        :id="port.key"
        type="source"
        :position="Position.Right"
        class="atom-node__handle"
        :style="{ background: portColor(port.type) }"
      />
    </div>
  </div>
</template>

<style scoped>
.atom-node {
  min-width: 180px;
  max-width: 260px;
  width: 220px;
  background: var(--color-bg-card, #1e1e2e);
  border: 2px solid var(--node-accent, #4a90e2);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text-primary, #e0e0e0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.15s, border-color 0.15s;
  user-select: none;
}

.atom-node--selected {
  border-color: var(--color-primary, #7b68ee);
  box-shadow: 0 0 0 2px var(--color-primary, #7b68ee), 0 4px 16px rgba(0, 0, 0, 0.5);
}

.atom-node__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--node-accent) 20%, transparent);
  border-bottom: 1px solid var(--node-accent);
  border-radius: 6px 6px 0 0;
  cursor: pointer;
}

.atom-node__icon { font-size: 14px; }
.atom-node__label { font-weight: 600; flex: 1; font-size: 13px; }
.atom-node__collapse-btn { opacity: 0.6; font-size: 10px; }

.atom-node__body {
  padding: 8px 0;
}

.atom-node__ports {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}

.atom-node__port-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px 2px 0;
  position: relative;
  min-height: 24px;
}

.atom-node__port-row--output {
  flex-direction: row-reverse;
  padding: 2px 0 2px 10px;
  text-align: right;
}

.atom-node__port-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-left: 14px;
}

.atom-node__port-row--output .atom-node__port-info {
  margin-left: 0;
  margin-right: 14px;
  align-items: flex-end;
}

.atom-node__port-label { font-size: 12px; opacity: 0.9; }
.atom-node__port-type { font-size: 11px; opacity: 0.6; font-family: monospace; }

.atom-node__handle {
  width: 10px !important;
  height: 10px !important;
  border: 2px solid var(--color-bg-card, #1e1e2e) !important;
}

.atom-node__static-input {
  font-size: 12px;
  padding: 3px 6px;
  background: var(--color-bg-input, #2a2a3e);
  border: 1px solid var(--color-border, #444);
  border-radius: 3px;
  color: var(--color-text-primary, #e0e0e0);
  width: 90px;
  flex-shrink: 0;
  margin-left: auto;
}

.atom-node__ref-badge {
  font-size: 10px;
  color: var(--color-text-secondary, #888);
  margin-left: auto;
  font-style: italic;
}

.atom-node__preview {
  margin: 4px 10px;
  padding: 4px 6px;
  background: var(--color-bg-input, #2a2a3e);
  border-radius: 4px;
  border-left: 2px solid var(--node-accent);
}

.atom-node__preview-row {
  display: flex;
  gap: 6px;
  font-size: 11px;
}

.atom-node__preview-key { opacity: 0.6; }
.atom-node__preview-val { font-weight: 600; color: var(--node-accent); }

.atom-node__collapsed-ports {
  position: relative;
  height: 8px;
}
</style>
