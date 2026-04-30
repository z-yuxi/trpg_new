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
        <button
          class="btn btn--ai"
          :disabled="aiCheckBusy || !moduleId"
          :class="{ 'btn--ai-active': aiPanelVisible }"
          @click="handleAiCheck"
        >
          {{ aiCheckBusy ? '校对中...' : 'AI 校对' }}
        </button>
        <button
          class="btn btn--secondary"
          :disabled="aiImportBusy || !editorContent"
          :title="'AI 分析当前内容，提取 NPC/场景/线索等结构化实体（异步，完成后通知）'"
          @click="handleAiImportAnalysis"
        >
          {{ aiImportBusy ? 'AI 分析中...' : 'AI 分析结构' }}
        </button>
        <button class="btn btn--secondary" @click="readerSettingsPanelOpen = true">叙阅器设置</button>
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

      <!-- 右侧 AI 校对面板 -->
      <aside class="props-panel" :class="{ 'props-panel--hidden': !aiPanelVisible }">
        <div class="props-title">
          AI 校对结果
          <button class="panel-close-btn" @click="aiPanelVisible = false">×</button>
        </div>
        <div v-if="aiCheckBusy" class="ai-loading">分析中，请稍候...</div>
        <div v-else-if="aiIssues.length === 0 && aiChecked" class="ai-empty">未发现问题，文本状态良好。</div>
        <div v-else-if="aiIssues.length === 0" class="ai-empty">点击「AI 校对」开始分析当前内容。</div>
        <ul v-else class="ai-issues-list">
          <li
            v-for="(issue, idx) in aiIssues"
            :key="idx"
            class="ai-issue-item"
            :class="`ai-issue--${issue.type}`"
          >
            <span class="issue-type-tag">{{ issueTypeLabel(issue.type) }}</span>
            <span class="issue-original">「{{ issue.original }}」</span>
            <span class="issue-arrow">→</span>
            <span class="issue-suggestion">{{ issue.suggestion }}</span>
            <span class="issue-reason">{{ issue.reason }}</span>
          </li>
        </ul>
        <div v-if="aiQuotaInfo" class="ai-quota-bar">
          本月已用 {{ aiQuotaInfo.used }}/{{ aiQuotaInfo.quota }} 次
        </div>
      </aside>
    </div>

    <ImportConfirmDialog
      :open="!!importPreview"
      :preview="importPreview"
      :busy="importBusy"
      @close="closeImportDialog"
      @confirm="confirmImport"
    />

    <!-- ── 叙阅器设置抽屉 §14.8 ──────────────────────────── -->
    <Teleport to="body">
      <div v-if="readerSettingsPanelOpen" class="rs-drawer" @click.self="readerSettingsPanelOpen = false">
        <div class="rs-drawer__panel">
          <header class="rs-drawer__head">
            <h2>叙阅器设置</h2>
            <button class="rs-drawer__close" @click="readerSettingsPanelOpen = false">×</button>
          </header>
          <div class="rs-drawer__body">

            <!-- 预设模板 -->
            <div class="rs-section">
              <p class="rs-section__label">快速预设</p>
              <div class="rs-presets">
                <button class="rs-preset-btn" @click="applyPreset('paid_strict')">付费作品严保护</button>
                <button class="rs-preset-btn" @click="applyPreset('free_open')">免费作品开放</button>
                <button class="rs-preset-btn" @click="applyPreset('private')">纯私密创作</button>
              </div>
            </div>

            <!-- 功能插件 -->
            <div class="rs-section">
              <p class="rs-section__label">功能开关</p>
              <div class="rs-toggles">
                <label><input type="checkbox" v-model="rsDraft.plugin_flags.toc" />章节目录</label>
                <label><input type="checkbox" v-model="rsDraft.plugin_flags.reading_progress" />阅读进度记录</label>
                <label><input type="checkbox" v-model="rsDraft.plugin_flags.share" />分享按钮</label>
                <label><input type="checkbox" v-model="rsDraft.plugin_flags.annotation" />划线笔记</label>
                <label><input type="checkbox" v-model="rsDraft.plugin_flags.import_campaign" />导入开团（模组专属）</label>
                <label><input type="checkbox" v-model="rsDraft.plugin_flags.export_structured_data" />结构化数据导出</label>
              </div>
            </div>

            <!-- 保护规则 -->
            <div class="rs-section">
              <p class="rs-section__label">内容保护</p>
              <div class="rs-toggles">
                <label><input type="checkbox" v-model="rsDraft.protection_flags.anti_bulk_copy" />防批量复制（≤200字）</label>
                <label><input type="checkbox" v-model="rsDraft.protection_flags.trace_watermark" />溯源水印（含 UID）</label>
                <label><input type="checkbox" v-model="rsDraft.protection_flags.disable_pdf_export" />禁止 PDF 导出</label>
                <label><input type="checkbox" v-model="rsDraft.protection_flags.disable_public_comments" />禁止公开划线评论</label>
                <label><input type="checkbox" v-model="rsDraft.protection_flags.embed_copyright_notice" />版权声明自动嵌入</label>
                <label><input type="checkbox" v-model="rsDraft.protection_flags.forbid_redistribution" />禁止二次分发</label>
              </div>
            </div>

            <!-- 试读策略 -->
            <div class="rs-section">
              <p class="rs-section__label">游客试读比例</p>
              <div class="rs-field">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  :value="Math.round((rsDraft.preview_policy.preview_ratio ?? 0) * 100)"
                  @input="(e) => rsDraft.preview_policy.preview_ratio = Number((e.target as HTMLInputElement).value) / 100"
                />
                <span class="rs-field__hint">
                  {{ Math.round((rsDraft.preview_policy.preview_ratio ?? 0) * 100) }}%
                  {{ rsDraft.preview_policy.preview_ratio ? '（游客可见前 ' + Math.round((rsDraft.preview_policy.preview_ratio) * 100) + '%）' : '（无试读内容）' }}
                </span>
              </div>
            </div>

            <!-- 外观 -->
            <div class="rs-section">
              <p class="rs-section__label">正文行距</p>
              <div class="rs-radio-group">
                <label v-for="opt in [['compact','紧凑'],['comfortable','适中'],['relaxed','宽松']]" :key="opt[0]">
                  <input type="radio" :value="opt[0]" v-model="rsDraft.appearance!.line_height" />
                  {{ opt[1] }}
                </label>
              </div>
            </div>

          </div>
          <footer class="rs-drawer__footer">
            <button class="btn btn--secondary" @click="readerSettingsPanelOpen = false">取消</button>
            <button class="btn btn--primary" :disabled="rsSaving" @click="saveReaderSettings">
              {{ rsSaving ? '保存中…' : '保存设置' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import ImportConfirmDialog from '../../components/module-editor/ImportConfirmDialog.vue';
import ModuleEditorCore from '../../components/module-editor/ModuleEditorCore.vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { api } from '../../utils/api';
import { getModule, updateModule, autoSaveModule, submitModule as apiSubmitModule, withdrawModule as apiWithdrawModule } from '../../api/modules';
import { extractOutline } from '../../utils/outline-extractor';
import { getToken } from '../../utils/api';
import { socketClient } from '../../socket/socket-client';
import type { Module, ModuleOutlineItem, ReaderSettings } from '@trpg/shared';
import { READER_SETTINGS_PRESETS } from '@trpg/shared';

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

// ── 叙阅器设置 ───────────────────────────────────────────
const readerSettingsPanelOpen = ref(false);
const rsSaving = ref(false);

function defaultReaderSettings(): ReaderSettings {
  return {
    plugin_flags: {
      toc: true,
      reading_progress: true,
      share: true,
      annotation: true,
      import_campaign: true,
      export_structured_data: false,
    },
    protection_flags: {
      anti_bulk_copy: false,
      disable_public_comments: false,
      disable_pdf_export: false,
      trace_watermark: false,
      embed_copyright_notice: false,
      forbid_redistribution: false,
    },
    preview_policy: { preview_ratio: 0 },
    appearance: { line_height: 'comfortable' },
  };
}

const rsDraft = ref<ReaderSettings>(defaultReaderSettings());

function applyPreset(key: keyof typeof READER_SETTINGS_PRESETS) {
  rsDraft.value = JSON.parse(JSON.stringify(READER_SETTINGS_PRESETS[key]));
}

async function saveReaderSettings() {
  if (!moduleId.value) return;
  rsSaving.value = true;
  try {
    await updateModule(moduleId.value, { reader_settings: rsDraft.value as any });
    if (module.value) (module.value as any).reader_settings = rsDraft.value;
  } catch (err) {
    alert('保存叙阅器设置失败');
    console.error(err);
  } finally {
    rsSaving.value = false;
    readerSettingsPanelOpen.value = false;
  }
}

interface ImportPreview {
  name: string;
  description: string;
  content: string;
  plain_text: string;
  word_count: number;
}

const importPreview = ref<ImportPreview | null>(null);

// ── AI 校对 ──────────────────────────────────────────────
interface AiIssue {
  type: 'typo' | 'punctuation' | 'term' | 'style';
  original: string;
  suggestion: string;
  reason: string;
}

const aiPanelVisible = ref(false);
const aiCheckBusy = ref(false);
const aiChecked = ref(false);
const aiIssues = ref<AiIssue[]>([]);
const aiQuotaInfo = ref<{ used: number; quota: number } | null>(null);

// AI 导入任务 ID → 等待 socket 回调
const pendingAiImportTaskId = ref<string | null>(null);

const ISSUE_TYPE_LABELS: Record<string, string> = {
  typo: '错别字',
  punctuation: '标点',
  term: '术语',
  style: '语句',
};
function issueTypeLabel(type: string): string {
  return ISSUE_TYPE_LABELS[type] ?? type;
}

async function fetchAiQuota() {
  try {
    const res = await api.get<{ month: string; used: Partial<Record<string, number>> }>('/ai/quota');
    const used = res.used['check_text'] ?? 0;
    // pro: 20次/月，creator: 100次/月（与后端 ai-quota.ts 保持一致）
    const quota = 20; // 展示基础档位，实际后端强制
    aiQuotaInfo.value = { used, quota };
  } catch {
    // 静默处理
  }
}

async function handleAiCheck() {
  const text = editorContent.value;
  if (!text || aiCheckBusy.value) return;
  aiCheckBusy.value = true;
  aiPanelVisible.value = true;
  aiIssues.value = [];
  aiChecked.value = false;
  try {
    const result = await api.post<{ issues: AiIssue[] }>('/ai/check-text', {
      text: text.slice(0, 5000), // 单次最多 5000 字
    });
    aiIssues.value = result.issues ?? [];
    aiChecked.value = true;
    await fetchAiQuota();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 403) {
      aiIssues.value = [];
      alert('AI 校对功能需要专业版或创作者版会员，请升级后使用。');
    } else if (e?.status === 429) {
      alert('本月 AI 校对次数已用完，下月自动重置。');
    } else {
      alert('AI 校对暂时不可用，请稍后重试。');
    }
    aiPanelVisible.value = false;
  } finally {
    aiCheckBusy.value = false;
  }
}

// AI 导入结构分析（异步入队，Socket 推送结果）
const aiImportBusy = ref(false);

async function handleAiImportAnalysis() {
  const text = editorContent.value;
  if (!text || aiImportBusy.value) return;
  aiImportBusy.value = true;
  try {
    const res = await api.post<{ task_id: string; message: string }>('/ai/import-module', {
      text_chunk: text.slice(0, 10000),
    });
    pendingAiImportTaskId.value = res.task_id;
    alert(`AI 分析任务已提交（ID: ${res.task_id}）\n完成后将通过通知推送结果。`);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e?.status === 403) {
      alert('AI 结构分析需要专业版或创作者版会员，请升级后使用。');
    } else if (e?.status === 429) {
      alert('本月 AI 模组导入次数已用完，下月自动重置。');
    } else {
      alert('任务提交失败，请稍后重试。');
    }
  } finally {
    aiImportBusy.value = false;
  }
}
const outlineCollapsed = ref(false);
const saveState = ref<'saved' | 'saving' | 'unsaved'>('saved');

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
    await autoSaveModule(moduleId.value, {
      content: editorContent.value,
      word_count: wordCount.value,
    } as any);
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
    await updateModule(moduleId.value, { name: moduleTitle.value });
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
    const res = await apiSubmitModule(moduleId.value) as { status: string; public_notice_end_at?: string | Date | null };
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
    const res = await apiWithdrawModule(moduleId.value) as { status: string };
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
const SAVE_CLASS: Record<'saved' | 'saving' | 'unsaved', string> = {
  saved: 'indicator--saved',
  saving: 'indicator--saving',
  unsaved: 'indicator--unsaved',
};
const SAVE_TEXT: Record<'saved' | 'saving' | 'unsaved', string> = {
  saved: '已保存',
  saving: '保存中...',
  unsaved: '未保存更改',
};
const saveIndicatorClass = computed(() => SAVE_CLASS[saveState.value]);
const saveIndicatorText = computed(() => SAVE_TEXT[saveState.value]);

// ── 加载 ─────────────────────────────────────────────────
onMounted(async () => {
  try {
    const data = await getModule(moduleId.value) as Module;
    module.value = data;
    moduleTitle.value = data.name;
    editorContent.value = data.content ?? null;
    if ((data as any).reader_settings) {
      rsDraft.value = JSON.parse(JSON.stringify((data as any).reader_settings));
    }
  } catch {
    router.push('/creator/modules');
  } finally {
    editorReady.value = true;
  }

  // 监听 AI 导入任务完成推送
  socketClient.connectUser();
  socketClient.onAiTaskUpdate((data) => {
    if (data.task_id !== pendingAiImportTaskId.value) return;
    pendingAiImportTaskId.value = null;
    importBusy.value = false;
    if (data.status === 'success' && data.result) {
      try {
        const parsed = typeof data.result === 'string'
          ? JSON.parse(data.result as string)
          : data.result;
        // 将 AI 分析结果转为导入预览格式
        importPreview.value = {
          name: module.value?.name ?? '',
          description: module.value?.description ?? '',
          content: editorContent.value ?? '',
          plain_text: '',
          word_count: wordCount.value,
          aiEntities: (parsed as { entities?: unknown[] })?.entities ?? [],
        } as ImportPreview & { aiEntities: unknown[] };
      } catch { /* ignore */ }
    } else if (data.status === 'failed') {
      alert(`AI 模组分析失败：${data.error ?? '未知错误'}（本次不消耗使用次数）`);
    }
  });

  await fetchAiQuota();
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
  socketClient.offAiTaskUpdate();
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
  background: var(--surface-page);
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
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-default);
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
  color: var(--color-primary);
  font-size: 14px;
  padding: 4px 8px;
}

.title-input {
  font-size: 16px;
  font-weight: 600;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-body);
  min-width: 200px;
  max-width: 400px;
}

.title-input:focus {
  border-bottom: 2px solid var(--color-primary);
}

.status-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-badge--draft { background: var(--color-warning-bg); color: var(--color-warning-text); }
.status-badge--public { background: var(--color-success-bg); color: var(--color-success); }
.status-badge--archived { background: var(--purple-50); color: var(--purple-700); }
.status-badge--reviewing { background: var(--color-info-bg); color: var(--color-info); }
.status-badge--public_notice { background: var(--color-warning-bg); color: var(--color-warning); }
.status-badge--suspended { background: var(--color-danger-bg); color: var(--color-danger); }

.public-notice-info {
  font-size: 13px;
  color: var(--color-warning);
  padding: 4px 8px;
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border-radius: 4px;
  white-space: nowrap;
}

.suspended-info {
  font-size: 13px;
  color: var(--color-danger);
  padding: 4px 8px;
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  border-radius: 4px;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.save-indicator { font-size: 12px; }
.indicator--saved { color: var(--color-success); }
.indicator--saving { color: var(--text-secondary); }
.indicator--unsaved { color: var(--color-warning); }

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
.btn--danger { background: var(--color-danger, #B85450); color: #fff; }
.btn--danger:hover { background: #A04743; }
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

.props-title {
  font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #888);
  text-transform: uppercase; margin-bottom: 12px;
  display: flex; align-items: center; justify-content: space-between;
}
.props-placeholder { font-size: 13px; color: var(--color-text-placeholder, #bbb); line-height: 1.6; }
.panel-close-btn {
  background: none; border: none; cursor: pointer; font-size: 16px;
  color: var(--color-text-muted, #aaa); padding: 0 2px; line-height: 1;
}
.panel-close-btn:hover { color: var(--color-text-primary, #222); }

/* AI 按钮 */
.btn--ai {
  background: color-mix(in srgb, var(--color-accent, #6366f1) 12%, var(--color-surface, #fff));
  color: var(--color-accent, #6366f1);
  border: 1px solid color-mix(in srgb, var(--color-accent, #6366f1) 40%, transparent);
  border-radius: var(--radius-md, 6px);
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background .15s;
}
.btn--ai:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent, #6366f1) 20%, var(--color-surface, #fff));
}
.btn--ai:disabled { opacity: .5; cursor: not-allowed; }
.btn--ai-active {
  background: var(--color-accent, #6366f1);
  color: #fff;
}

/* AI 校对结果面板 */
.ai-loading, .ai-empty {
  font-size: 13px; color: var(--color-text-muted, #aaa); text-align: center; padding: 24px 0;
}
.ai-issues-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.ai-issue-item {
  display: flex; flex-direction: column; gap: 3px;
  background: var(--color-input-bg, #f8f8f8);
  border-radius: 6px; padding: 8px 10px;
  border-left: 3px solid var(--color-accent, #6366f1);
  font-size: 12px;
}
.ai-issue--typo { border-left-color: #ef4444; }
.ai-issue--punctuation { border-left-color: #3b82f6; }
.ai-issue--term { border-left-color: #f59e0b; }
.ai-issue--style { border-left-color: #10b981; }
.issue-type-tag {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  color: var(--color-text-muted, #aaa);
}
.issue-original { color: #ef4444; font-family: var(--font-mono, monospace); }
.issue-arrow { color: var(--color-text-muted, #aaa); }
.issue-suggestion { color: #10b981; font-weight: 600; }
.issue-reason { color: var(--color-text-muted, #aaa); font-style: italic; }
.ai-quota-bar {
  font-size: 11px; color: var(--color-text-muted, #aaa);
  text-align: right; padding-top: 8px; border-top: 1px solid var(--color-border, #eee); margin-top: 8px;
}

/* ── 叙阅器设置抽屉 ─────────────────────────────────────── */
.rs-drawer {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.45);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}
.rs-drawer__panel {
  background: var(--color-surface, #fff);
  width: 420px;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0,0,0,.15);
}
.rs-drawer__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #eee);
}
.rs-drawer__head h2 { margin: 0; font-size: 16px; }
.rs-drawer__close {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: var(--text-secondary, #888);
  line-height: 1;
}
.rs-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.rs-drawer__footer {
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #eee);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.rs-section__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: .05em;
  margin: 0 0 8px;
}
.rs-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rs-preset-btn {
  padding: 4px 12px;
  font-size: 13px;
  border: 1px solid var(--color-primary, #6c63ff);
  border-radius: 999px;
  background: none;
  color: var(--color-primary, #6c63ff);
  cursor: pointer;
  transition: background .15s;
}
.rs-preset-btn:hover {
  background: color-mix(in srgb, var(--color-primary, #6c63ff) 10%, transparent);
}
.rs-toggles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rs-toggles label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.rs-field {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rs-field input[type=range] { flex: 1; }
.rs-field__hint { font-size: 13px; color: var(--text-secondary, #888); white-space: nowrap; }
.rs-radio-group {
  display: flex;
  gap: 16px;
}
.rs-radio-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
}
</style>
