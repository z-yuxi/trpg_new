<template>
  <div class="module-editor-page">
    <!-- 顶部栏 -->
    <header class="module-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">← 返回</button>
        <input
          v-model="moduleTitle"
          class="title-input"
          placeholder="模组标题..."
          @blur="handleTitleBlur"
        />
        <span class="status-badge" :class="`status-badge--${module?.status ?? 'draft'}`">
          {{ statusLabel }}
        </span>
      </div>
      <div class="header-right">
        <span class="save-indicator" :class="saveIndicatorClass">{{ saveIndicatorText }}</span>
        <button class="btn btn--secondary" @click="manualSave">保存</button>
        <button class="btn btn--primary" :disabled="!canPublish" @click="handlePublish">发布</button>
      </div>
    </header>

    <div class="module-layout">
      <!-- 左侧大纲 -->
      <aside class="outline-panel" :class="{ 'outline-panel--collapsed': outlineCollapsed }">
        <button class="outline-toggle" @click="outlineCollapsed = !outlineCollapsed">
          {{ outlineCollapsed ? '▶' : '◀' }}
        </button>
        <div v-if="!outlineCollapsed" class="outline-content">
          <div class="outline-title">大纲</div>
          <div v-if="outlineItems.length === 0" class="outline-empty">（内容为空）</div>
          <div
            v-for="item in outlineItems"
            :key="item.id"
            class="outline-item"
            :class="`outline-item--${item.type}`"
            @click="scrollToBlock(item.id)"
          >
            <span class="outline-indent" :style="{ paddingLeft: `${(item.level ?? 0) * 12}px` }">
              {{ outlineItemIcon(item.type) }} {{ item.label }}
            </span>
          </div>
        </div>
      </aside>

      <!-- 中央编辑区 -->
      <main class="editor-main">
        <ModuleEditorCore
          v-if="editorReady"
          v-model="editorContent"
          @word-count="onWordCount"
        />
        <div v-else class="editor-loading">加载中...</div>
      </main>

      <!-- 右侧属性面板（预留位置，批次2实现） -->
      <aside class="props-panel" :class="{ 'props-panel--hidden': !propsPanelVisible }">
        <div class="props-title">属性</div>
        <div class="props-placeholder">选中业务块后此处将显示属性编辑表单</div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ModuleEditorCore from '../../components/module-editor/ModuleEditorCore.vue';
import { api } from '../../utils/api';
import type { Module, ModuleOutlineItem } from '@trpg/shared';

const router = useRouter();
const route = useRoute();

const moduleId = computed(() => route.params['id'] as string);

// ── 状态 ─────────────────────────────────────────────────
const module = ref<Module | null>(null);
const moduleTitle = ref('');
const editorContent = ref<string | null>(null);
const editorReady = ref(false);
const wordCount = ref(0);

// 保存状态: 'saved' | 'saving' | 'unsaved'
const saveState = ref<'saved' | 'saving' | 'unsaved'>('saved');
const outlineCollapsed = ref(false);
const propsPanelVisible = ref(false);

// ── 自动保存（debounce 3s） ──────────────────────────────
let saveTimer: ReturnType<typeof setTimeout> | null = null;

watch(editorContent, () => {
  saveState.value = 'unsaved';
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => autoSave(), 3000);
});

async function autoSave() {
  if (!moduleId.value || editorContent.value === null) return;
  saveState.value = 'saving';
  try {
    await api.put(`/api/modules/${moduleId.value}/auto-save`, {
      content: editorContent.value,
      word_count: wordCount.value,
    });
    saveState.value = 'saved';
  } catch {
    saveState.value = 'unsaved';
  }
}

async function manualSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await autoSave();
}

function onWordCount(count: number) {
  wordCount.value = count;
}

// ── 标题变更 ─────────────────────────────────────────────
async function handleTitleBlur() {
  if (!moduleId.value || moduleTitle.value === module.value?.name) return;
  try {
    await api.put(`/api/modules/${moduleId.value}`, { name: moduleTitle.value });
  } catch {
    // 静默处理
  }
}

// ── 发布 ─────────────────────────────────────────────────
const canPublish = computed(() => module.value?.status === 'draft');
const statusLabel = computed(() => ({
  draft: '草稿',
  public: '已发布',
  archived: '已归档',
}[module.value?.status ?? 'draft']));

async function handlePublish() {
  // V1.0 直接设为 public（发布状态机后续实现）
  if (!moduleId.value) return;
  await api.put(`/api/modules/${moduleId.value}`, { status: 'public' });
  if (module.value) module.value.status = 'public';
}

// ── 大纲 ─────────────────────────────────────────────────
const outlineItems = ref<ModuleOutlineItem[]>([]);

function outlineItemIcon(type: ModuleOutlineItem['type']) {
  return { heading: '§', scene: '📍', npc: '🧑', event: '⚡', clue: '🔍', check: '🎲', dialog: '💬' }[type] ?? '•';
}

function scrollToBlock(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

// 从 TipTap JSON 内容中提取大纲
function extractOutline(contentJson: string | null): ModuleOutlineItem[] {
  if (!contentJson) return [];
  try {
    const doc = JSON.parse(contentJson);
    const items: ModuleOutlineItem[] = [];
    for (const node of doc.content ?? []) {
      if (node.type === 'heading') {
        const text = (node.content ?? []).map((c: any) => c.text ?? '').join('');
        if (text) items.push({ id: `heading-${items.length}`, type: 'heading', label: text, level: node.attrs?.level ?? 1 });
      } else if (['scene_block', 'npc_block', 'event_block', 'clue_block', 'check_block', 'dialog_block'].includes(node.type)) {
        const blockType = node.type.replace('_block', '') as ModuleOutlineItem['type'];
        const nameKey = { scene_block: 'scene_name', npc_block: 'npc_name', event_block: 'event_name', clue_block: 'clue_name', check_block: 'check_name', dialog_block: 'speaker' }[node.type] ?? 'name';
        const label = node.attrs?.[nameKey] || `未命名${blockType}`;
        items.push({ id: node.attrs?.id ?? `block-${items.length}`, type: blockType, label });
      }
    }
    return items;
  } catch { return []; }
}

watch(editorContent, (val) => {
  outlineItems.value = extractOutline(val);
});

// ── 保存提示 ─────────────────────────────────────────────
const saveIndicatorClass = computed(() => ({
  'saved': 'indicator--saved',
  'saving': 'indicator--saving',
  'unsaved': 'indicator--unsaved',
}[saveState.value]));

const saveIndicatorText = computed(() => ({
  'saved': '已保存',
  'saving': '保存中...',
  'unsaved': '未保存更改',
}[saveState.value]));

// ── 加载 ─────────────────────────────────────────────────
onMounted(async () => {
  try {
    const data = await api.get<Module>(`/api/modules/${moduleId.value}`);
    module.value = data;
    moduleTitle.value = data.name;
    editorContent.value = data.content ?? null;
  } catch {
    // 模组不存在时跳回列表
    router.push('/creator/modules');
  } finally {
    editorReady.value = true;
  }
});

// ── 离开前提示 ───────────────────────────────────────────
function beforeUnloadHandler(e: BeforeUnloadEvent) {
  if (saveState.value === 'unsaved') {
    e.preventDefault();
    e.returnValue = '';
  }
}

onMounted(() => window.addEventListener('beforeunload', beforeUnloadHandler));
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
  if (saveTimer) clearTimeout(saveTimer);
});

function goBack() {
  if (saveState.value === 'unsaved') {
    if (!confirm('有未保存的更改，确认离开？')) return;
  }
  router.push('/creator/modules');
}
</script>

<style scoped>
.module-editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-background, #f5f5f5);
}

/* 顶部栏 */
.module-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 52px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  flex-shrink: 0;
  gap: 16px;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-primary, #1976d2);
  font-size: 14px;
  padding: 4px 8px;
}

.title-input {
  font-size: 16px;
  font-weight: 600;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text, #333);
  min-width: 200px;
  max-width: 400px;
}

.title-input:focus {
  border-bottom: 2px solid var(--color-primary, #1976d2);
}

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-badge--draft { background: #fff3e0; color: #e65100; }
.status-badge--public { background: #e8f5e9; color: #2e7d32; }
.status-badge--archived { background: #f3e5f5; color: #6a1b9a; }

.save-indicator { font-size: 12px; }
.indicator--saved { color: var(--color-success, #4caf50); }
.indicator--saving { color: var(--color-text-secondary, #888); }
.indicator--unsaved { color: var(--color-warning, #ff9800); }

.btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}

.btn--primary { background: var(--color-primary, #1976d2); color: #fff; }
.btn--primary:hover { background: var(--color-primary-dark, #1565c0); }
.btn--primary:disabled { background: var(--color-disabled, #bdbdbd); cursor: not-allowed; }
.btn--secondary { background: var(--color-hover, #f5f5f5); color: var(--color-text, #333); }
.btn--secondary:hover { background: var(--color-border, #e0e0e0); }

/* 布局 */
.module-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 左侧大纲 */
.outline-panel {
  width: 220px;
  background: var(--color-surface, #fff);
  border-right: 1px solid var(--color-border, #e0e0e0);
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
  flex-shrink: 0;
  position: relative;
}

.outline-panel--collapsed {
  width: 32px;
}

.outline-toggle {
  position: absolute;
  right: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid var(--color-border, #e0e0e0);
  background: var(--color-surface, #fff);
  cursor: pointer;
  font-size: 10px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.outline-content { padding: 12px 8px; overflow-y: auto; flex: 1; }
.outline-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary, #888); text-transform: uppercase; margin-bottom: 8px; padding: 0 4px; }
.outline-empty { font-size: 12px; color: var(--color-text-placeholder, #bbb); padding: 4px; }

.outline-item {
  font-size: 13px;
  padding: 4px 4px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--color-text, #333);
  transition: background 0.12s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-item:hover { background: var(--color-hover, #f5f5f5); }

.outline-item--heading { font-weight: 500; }
.outline-item--scene, .outline-item--npc, .outline-item--event,
.outline-item--clue, .outline-item--check, .outline-item--dialog {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
}

/* 主编辑区 */
.editor-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.editor-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #888);
}

/* 右侧属性面板 */
.props-panel {
  width: 280px;
  background: var(--color-surface, #fff);
  border-left: 1px solid var(--color-border, #e0e0e0);
  padding: 16px;
  overflow-y: auto;
  flex-shrink: 0;
}

.props-panel--hidden { display: none; }

.props-title { font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #888); text-transform: uppercase; margin-bottom: 12px; }
.props-placeholder { font-size: 13px; color: var(--color-text-placeholder, #bbb); line-height: 1.6; }
</style>
