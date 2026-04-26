<template>
  <div class="module-editor-page">
    <input
      ref="importInput"
      class="visually-hidden"
      type="file"
      accept=".txt,.md,.docx"
      @change="handleImportFileChange"
    />

    <!-- 顶部栏 -->
    <header class="module-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">返回</button>
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
        <button class="btn btn--secondary" :disabled="module?.status !== 'draft' || importBusy" @click="triggerImport">
          {{ importBusy ? '解析中...' : '导入文档' }}
        </button>
        <button class="btn btn--secondary" :disabled="exportBusy || !moduleId" @click="handleExportPdf">
          {{ exportBusy ? '导出中...' : '导出 PDF' }}
        </button>
        <button class="btn btn--secondary" @click="manualSave">保存</button>
        <button
          v-if="module?.status === 'draft'"
          class="btn btn--primary"
          :disabled="!canPublish"
          @click="handlePublish"
        >
          发布
        </button>
        <button
          v-else-if="['reviewing', 'public_notice'].includes(module?.status ?? '')"
          class="btn btn--danger"
          @click="handleWithdraw"
        >
          撤回
        </button>
        <div v-if="module?.status === 'public_notice'" class="public-notice-info">
          公示期: {{ noticeCountdown }} 天
        </div>
        <div v-if="module?.status === 'suspended'" class="suspended-info">
          已暂停: {{ module?.suspended_reason ?? '未指定原因' }}
        </div>
      </div>
    </header>

    <div class="module-layout">
      <!-- 左侧大纲 -->
      <aside class="outline-panel" :class="{ 'outline-panel--collapsed': outlineCollapsed }">
        <button class="outline-toggle" @click="outlineCollapsed = !outlineCollapsed">
          <SvgIcon name="icon-chevron-right" :size="12" class="outline-toggle-icon" :class="{ 'outline-toggle-icon--expanded': !outlineCollapsed }" />
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
              <SvgIcon :name="outlineItemIcon(item.type)" :size="12" class="outline-item-icon" />
              {{ item.label }}
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

      <!-- 右侧属性面板（预留位置，批次 2 实现） -->
      <aside class="props-panel" :class="{ 'props-panel--hidden': !propsPanelVisible }">
        <div class="props-title">属性</div>
        <div class="props-placeholder">选中业务块后此处将显示属性编辑表单</div>
      </aside>
    </div>

    <ImportConfirmDialog
      :open="!!importPreview"
      :preview="importPreview"
      :busy="importBusy"
      @close="closeImportDialog"
      @confirm="confirmImport"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ImportConfirmDialog from '../../components/module-editor/ImportConfirmDialog.vue';
import ModuleEditorCore from '../../components/module-editor/ModuleEditorCore.vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { api } from '../../utils/api';
import { extractOutline } from '../../utils/outline-extractor';
import { getToken } from '../../utils/api';
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
const importInput = ref<HTMLInputElement | null>(null);
const importBusy = ref(false);
const exportBusy = ref(false);

interface ImportPreview {
  name: string;
  description: string;
  content: string;
  plain_text: string;
  word_count: number;
}

const importPreview = ref<ImportPreview | null>(null);

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
    await api.put(`/modules/${moduleId.value}/auto-save`, {
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

function triggerImport() {
  if (module.value?.status !== 'draft' || importBusy.value) return;
  importInput.value?.click();
}

async function handleImportFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file || !moduleId.value) return;

  const body = new FormData();
  body.append('file', file);

  importBusy.value = true;
  try {
    const res = await fetch(`/api/modules/${moduleId.value}/import`, {
      method: 'POST',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined,
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '导入失败' }));
      throw new Error(err.error ?? '导入失败');
    }

    importPreview.value = await res.json() as ImportPreview;
  } catch (err) {
    console.error('导入失败', err);
    alert(err instanceof Error ? err.message : '导入失败');
  } finally {
    importBusy.value = false;
  }
}

function closeImportDialog() {
  if (importBusy.value) return;
  importPreview.value = null;
}

async function confirmImport(payload: { name: string; description: string; content: string; word_count: number }) {
  if (!moduleId.value) return;
  importBusy.value = true;
  try {
    const updated = await api.post<Module>(`/modules/${moduleId.value}/import/confirm`, payload);
    module.value = updated;
    moduleTitle.value = updated.name;
    editorContent.value = updated.content ?? null;
    wordCount.value = payload.word_count;
    saveState.value = 'saved';
    importPreview.value = null;
  } catch (err) {
    console.error('确认导入失败', err);
    alert(err instanceof Error ? err.message : '确认导入失败');
  } finally {
    importBusy.value = false;
  }
}

async function handleExportPdf() {
  if (!moduleId.value || exportBusy.value) return;
  exportBusy.value = true;
  try {
    const res = await fetch(`/api/modules/${moduleId.value}/export/pdf`, {
      method: 'POST',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '导出失败' }));
      throw new Error(err.error ?? '导出失败');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleTitle.value || 'module'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 延迟撤销，确保浏览器有足够时间读取 Blob 数据再触发下载
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (err) {
    console.error('导出失败', err);
    alert(err instanceof Error ? err.message : '导出失败');
  } finally {
    exportBusy.value = false;
  }
}

function onWordCount(count: number) {
  wordCount.value = count;
}

// ── 标题变更 ─────────────────────────────────────────────
async function handleTitleBlur() {
  if (!moduleId.value || moduleTitle.value === module.value?.name) return;
  try {
    await api.put(`/modules/${moduleId.value}`, { name: moduleTitle.value });
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
  reviewing: '审核中',
  public_notice: '公示中',
  suspended: '已暂停',
}[module.value?.status ?? 'draft']));

async function handlePublish() {
  // Batch 4: 提交发布审核（draft -> public_notice）
  if (!moduleId.value) return;
  try {
    const res = await api.post<{ status: string; public_notice_end_at?: string | Date | null }>(`/modules/${moduleId.value}/submit`);
    if (module.value) {
      module.value.status = res.status as any;
      module.value.public_notice_end_at = res.public_notice_end_at as any;
    }
  } catch (err) {
    console.error('提交失败', err);
  }
}

// 撤回模组
async function handleWithdraw() {
  if (!moduleId.value) return;
  try {
    const res = await api.post<{ status: string }>(`/modules/${moduleId.value}/withdraw`);
    if (module.value) module.value.status = res.status as any;
  } catch (err) {
    console.error('撤回失败', err);
  }
}

// 计算公示期剩余天数
const noticeCountdown = computed(() => {
  if (!module.value?.public_notice_end_at) return '-';
  const endAt = new Date(module.value.public_notice_end_at);
  const now = new Date();
  const daysDiff = Math.ceil((endAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, daysDiff);
});

// ── 大纲 ─────────────────────────────────────────────────
const outlineItems = ref<ModuleOutlineItem[]>([]);

function outlineItemIcon(type: ModuleOutlineItem['type']) {
  return {
    heading: 'icon-list',
    scene: 'icon-scene',
    npc: 'icon-npc',
    event: 'icon-timeline',
    clue: 'icon-clue',
    check: 'icon-dice',
    dialog: 'icon-broadcast',
  }[type] ?? 'icon-list';
}

function scrollToBlock(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
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
    const data = await api.get<Module>(`/modules/${moduleId.value}`);
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

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

.header-right {
  flex-wrap: wrap;
  justify-content: flex-end;
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
.status-badge--reviewing { background: #e1f5fe; color: #0277bd; }
.status-badge--public_notice { background: #fff9c4; color: #f57f17; }
.status-badge--suspended { background: #ffebee; color: #c62828; }

.public-notice-info {
  font-size: 13px;
  color: var(--color-warning, #ff9800);
  padding: 4px 8px;
  background: rgba(255, 152, 0, 0.1);
  border-radius: 4px;
  white-space: nowrap;
}

.suspended-info {
  font-size: 13px;
  color: var(--color-danger, #f44336);
  padding: 4px 8px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 4px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

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
.btn--danger { background: var(--color-danger, #dc2626); color: #fff; }
.btn--danger:hover { background: #b91c1c; }
.btn:disabled { opacity: 0.7; cursor: not-allowed; }

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

.outline-toggle-icon { transition: transform 0.2s ease; }
.outline-toggle-icon--expanded { transform: rotate(180deg); }

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

.outline-indent {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.outline-item-icon { color: var(--text-muted, #666); flex-shrink: 0; }

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
