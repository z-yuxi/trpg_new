<template>
  <div class="outline-panel">
    <!-- 顶部视图切换 -->
    <div class="outline-panel__tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="outline-panel__tab"
        :class="{ 'outline-panel__tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </div>

    <!-- 时间轴 / 空间树：大纲列表 -->
    <div v-if="activeTab !== 'network'" class="outline-panel__list" role="tree">
      <div v-if="items.length === 0" class="outline-panel__empty">暂无大纲内容</div>
      <OutlineItem
        v-for="item in items"
        :key="item.id"
        :item="item"
        :active-id="activeId"
        @select="handleSelect"
      />
    </div>

    <!-- 节点网络：占位 -->
    <div v-else class="outline-panel__network-placeholder">
      <span class="outline-panel__network-icon">⬡</span>
      <p>节点网络视图</p>
      <p class="outline-panel__network-hint">此视图在复杂模组中呈现场景间连通关系<br>当前版本暂未实现</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineComponent, h } from 'vue';
import { extractOutline } from '../../utils/outline-extractor';
import type { ModuleOutlineItem } from '@trpg/shared';

// ── Props / Emits ──────────────────────────────────────────────────────────────
const props = defineProps<{
  /** TipTap editor.getJSON() 返回值 */
  docJson: unknown;
  /** 当前光标所在节点 id，用于高亮 */
  activeId?: string;
}>();

const emit = defineEmits<{
  (e: 'scrollTo', id: string): void;
}>();

// ── 视图切换 ───────────────────────────────────────────────────────────────────
type TabId = 'timeline' | 'space' | 'network';
interface Tab { id: TabId; label: string }

const TABS: Tab[] = [
  { id: 'timeline', label: '时间轴' },
  { id: 'space',    label: '空间树' },
  { id: 'network',  label: '节点网络' },
];
const activeTab = ref<TabId>('timeline');

// ── 大纲数据 ───────────────────────────────────────────────────────────────────
const items = computed<ModuleOutlineItem[]>(() => extractOutline(props.docJson));

// ── 交互 ───────────────────────────────────────────────────────────────────────
function handleSelect(id: string) {
  emit('scrollTo', id);
}

// ── 子组件（单行节点渲染，内联定义避免多文件拆散）────────────────────────────────
const ICON_MAP: Record<ModuleOutlineItem['type'], string> = {
  heading:     '📄',
  investigable: '🔵',
  kp_info:     '🔒',
  branch:      '🔀',
  consequence: '▶',
  handout:     '🟠',
  npc_mention: '🟣',
  rule_ref:    '🎲',
  // 旧块保持中性图标
  scene:   '🎬',
  npc:     '👤',
  event:   '⚡',
  clue:    '🔍',
  check:   '🎰',
  dialog:  '💬',
};

// 用 defineComponent + render 实现递归树节点，规避 <script setup> 中无法自引用的限制
const OutlineItem = defineComponent({
  name: 'OutlineItem',
  props: {
    item: { type: Object as () => ModuleOutlineItem, required: true },
    activeId: { type: String, default: '' },
  },
  emits: ['select'],
  setup(itemProps, { emit: itemEmit }) {
    const expanded = ref(true);

    return () => {
      const { item, activeId } = itemProps;
      const icon = ICON_MAP[item.type] ?? '▪';
      const indent = (item.depth ?? 0) * 16;
      const isHeading = item.type === 'heading';
      const isKp = item.type === 'kp_info';
      const isActive = item.id === activeId;

      return h('div', {
        class: [
          'outline-item',
          `outline-item--${item.type}`,
          isActive && 'outline-item--active',
          isKp && 'outline-item--kp',
          isHeading && item.level ? `outline-item--h${item.level}` : '',
        ],
        role: 'treeitem',
        style: { paddingLeft: `${8 + indent}px` },
        onClick: () => itemEmit('select', item.id),
      }, [
        h('span', { class: 'outline-item__icon', 'aria-hidden': 'true' }, icon),
        h('span', { class: 'outline-item__label', title: item.label }, item.label),
        isKp ? h('span', { class: 'outline-item__kp-badge', title: 'KP 专属' }, '仅KP') : null,
        item.hasContent === false
          ? h('span', { class: 'outline-item__empty-hint', title: '尚无内容' }, '空')
          : null,
      ]);
    };
  },
});
</script>

<style scoped>
/* ── 容器 ───────────────────────────────────────────────────────────────── */
.outline-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fafafa;
  border-right: 1px solid #e8e8e8;
  font-size: 13px;
  user-select: none;
}

/* ── 标签栏 ─────────────────────────────────────────────────────────────── */
.outline-panel__tabs {
  display: flex;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.outline-panel__tab {
  flex: 1;
  padding: 8px 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: #888;
  transition: color 0.15s, border-bottom 0.15s;
  border-bottom: 2px solid transparent;
}

.outline-panel__tab:hover { color: #333; }

.outline-panel__tab--active {
  color: #333;
  font-weight: 600;
  border-bottom: 2px solid #4f6ef7;
}

/* ── 列表 ───────────────────────────────────────────────────────────────── */
.outline-panel__list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.outline-panel__empty {
  padding: 24px 16px;
  color: #aaa;
  text-align: center;
  font-size: 12px;
}

/* ── 节点行 ─────────────────────────────────────────────────────────────── */
:deep(.outline-item) {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 4px;
  padding-right: 8px;
  padding-bottom: 4px;
  cursor: pointer;
  border-radius: 4px;
  margin: 1px 4px;
  transition: background 0.1s;
  white-space: nowrap;
  overflow: hidden;
}

:deep(.outline-item:hover) { background: #eef0f8; }

:deep(.outline-item--active) {
  background: #e8ecff;
  font-weight: 500;
}

/* 标题缩进额外加大 */
:deep(.outline-item--h1) { font-size: 13px; font-weight: 700; }
:deep(.outline-item--h2) { font-size: 13px; font-weight: 600; }
:deep(.outline-item--h3) { font-size: 12px; }

/* KP 专属行：淡黄色底 */
:deep(.outline-item--kp) { background: #fffbea; }
:deep(.outline-item--kp:hover) { background: #fff4c0; }

:deep(.outline-item__icon) {
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  font-size: 12px;
}

:deep(.outline-item__label) {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #333;
}

:deep(.outline-item__kp-badge) {
  flex-shrink: 0;
  font-size: 10px;
  background: #ffe58f;
  color: #874d00;
  border-radius: 3px;
  padding: 0 4px;
}

:deep(.outline-item__empty-hint) {
  flex-shrink: 0;
  font-size: 10px;
  color: #bbb;
  border: 1px dashed #ddd;
  border-radius: 3px;
  padding: 0 4px;
}

/* npc_mention 紫色调 */
:deep(.outline-item--npc_mention .outline-item__label) { color: #6b21a8; }
/* kp_info */
:deep(.outline-item--kp_info .outline-item__label) { color: #78350f; }
/* investigable 蓝色调 */
:deep(.outline-item--investigable .outline-item__label) { color: #1e40af; }

/* ── 节点网络占位 ────────────────────────────────────────────────────────── */
.outline-panel__network-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #aaa;
  padding: 24px;
  text-align: center;
}

.outline-panel__network-icon { font-size: 32px; }

.outline-panel__network-hint {
  font-size: 11px;
  line-height: 1.6;
  color: #bbb;
}
</style>
