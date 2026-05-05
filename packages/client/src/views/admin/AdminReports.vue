<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../utils/api';

interface AiSuggestion {
  agent_id: string;
  action: string;
  confidence: number;
  evidence?: string | null;
  rule?: string | null;
  decision_trace?: string | null;
  created_at: string;
}

interface Report {
  id: string;
  reporter_user_id: string;
  content_type: string;
  content_id: string;
  reason: string;
  status: string;
  resolution_note?: string;
  created_at: string;
  ai_suggestion?: AiSuggestion | null;
}

const loading = ref(false);
const error = ref('');
const reports = ref<Report[]>([]);
const actionBusy = ref<string | null>(null); // report id being actioned

/** AI 建议弹窗状态 */
const modalSuggestion = ref<AiSuggestion | null>(null);
const modalReportId = ref<string | null>(null);
const traceExpanded = ref(false);

function openSuggestion(r: Report) {
  modalSuggestion.value = r.ai_suggestion ?? null;
  modalReportId.value = r.id;
  traceExpanded.value = false;
}
function closeSuggestion() {
  modalSuggestion.value = null;
  modalReportId.value = null;
}

/** 根据 confidence 返回颜色类 */
function confidenceClass(c: number): string {
  if (c >= 80) return 'conf-high';
  if (c >= 50) return 'conf-mid';
  return 'conf-low';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get<Report[]>('/reports');
    reports.value = Array.isArray(res) ? res : (res as any).data ?? [];
  } catch (e: any) {
    error.value = e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

async function updateStatus(id: string, status: 'resolved' | 'dismissed') {
  const note = status === 'resolved'
    ? prompt('处理备注（可选）：')
    : null;
  if (note === undefined) return; // user cancelled prompt for resolved
  actionBusy.value = id;
  try {
    await api.patch(`/reports/${id}`, { status, resolution_note: note ?? undefined });
    const idx = reports.value.findIndex(r => r.id === id);
    if (idx !== -1) reports.value[idx]!.status = status;
  } catch (e: any) {
    alert(e?.message ?? '操作失败');
  } finally {
    actionBusy.value = null;
  }
}

function statusLabel(s: string) {
  return { pending: '待处理', resolved: '已处理', dismissed: '已忽略' }[s] ?? s;
}

function typeLabel(t: string) {
  return { message: '消息', post: '帖子', user: '用户', module: '模组', ruleset: '规则集' }[t] ?? t;
}

onMounted(load);
</script>

<template>
  <div class="admin-reports">
    <div class="page-header">
      <h1 class="page-title">举报处理</h1>
      <button class="refresh-btn" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="loading" class="loading-text">加载中…</div>

    <template v-else>
      <p class="summary-text">共 {{ reports.length }} 条</p>
      <div v-if="reports.length === 0" class="empty-text">暂无举报记录</div>
      <table v-else class="report-table">
        <thead>
          <tr>
            <th>类型</th>
            <th>内容 ID</th>
            <th>举报原因</th>
            <th>状态</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in reports" :key="r.id">
            <td>{{ typeLabel(r.content_type) }}</td>
            <td class="id-cell" :title="r.content_id">{{ r.content_id.slice(0, 12) }}…</td>
            <td>{{ r.reason }}</td>
            <td>
              <span class="status-badge" :class="`status-${r.status}`">{{ statusLabel(r.status) }}</span>
            </td>
            <td class="time-cell">{{ r.created_at ? new Date(r.created_at).toLocaleString() : '—' }}</td>
            <td class="action-cell">
              <!-- AI 建议标签 -->
              <button
                v-if="r.ai_suggestion"
                class="ai-badge"
                :class="[confidenceClass(r.ai_suggestion.confidence), r.status !== 'pending' ? 'ai-badge-done' : '']"
                @click="openSuggestion(r)"
              >
                AI建议：{{ r.ai_suggestion.action }}
              </button>
              <template v-if="r.status === 'pending'">
                <button
                  class="action-btn resolve"
                  :disabled="actionBusy === r.id"
                  @click="updateStatus(r.id, 'resolved')"
                >处理</button>
                <button
                  class="action-btn dismiss"
                  :disabled="actionBusy === r.id"
                  @click="updateStatus(r.id, 'dismissed')"
                >忽略</button>
              </template>
              <span v-else class="action-done">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>

  <!-- AI 建议详情弹窗 -->
  <Teleport to="body">
    <div v-if="modalSuggestion" class="modal-overlay" @click.self="closeSuggestion">
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-header">
          <span class="modal-title">🤖 AI 审查建议</span>
          <button class="modal-close" @click="closeSuggestion">✕</button>
        </div>
        <div class="modal-body">
          <div class="modal-row">
            <span class="modal-label">建议 Agent</span>
            <span class="modal-value">{{ modalSuggestion.agent_id }}</span>
          </div>
          <div class="modal-row">
            <span class="modal-label">建议操作</span>
            <span class="modal-value">{{ modalSuggestion.action }}</span>
          </div>
          <div class="modal-row">
            <span class="modal-label">置信度</span>
            <span class="modal-value conf-bar-wrap">
              <span
                class="conf-bar"
                :class="confidenceClass(modalSuggestion.confidence)"
                :style="{ width: modalSuggestion.confidence + '%' }"
              ></span>
              <span class="conf-num">{{ modalSuggestion.confidence }}%</span>
            </span>
          </div>
          <div v-if="modalSuggestion.evidence" class="modal-row">
            <span class="modal-label">违规证据</span>
            <span class="modal-value">{{ modalSuggestion.evidence }}</span>
          </div>
          <div v-if="modalSuggestion.rule" class="modal-row">
            <span class="modal-label">匹配规则</span>
            <span class="modal-value">{{ modalSuggestion.rule }}</span>
          </div>
          <div v-if="modalSuggestion.decision_trace" class="modal-row modal-row-trace">
            <button class="trace-toggle" @click="traceExpanded = !traceExpanded">
              {{ traceExpanded ? '▾ 折叠决策轨迹' : '▸ 展开决策轨迹' }}
            </button>
            <pre v-if="traceExpanded" class="trace-pre">{{ modalSuggestion.decision_trace }}</pre>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.admin-reports { max-width: 1100px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); }
.refresh-btn { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); cursor: pointer; font-size: var(--text-sm); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error-banner { background: #fff0f0; color: #c00; border: 1px solid #fcc; border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); }
.loading-text, .empty-text { color: var(--text-muted); font-size: var(--text-sm); padding: var(--space-4); }
.summary-text { font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-3); }
.report-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); background: var(--surface-card); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border-default); }
.report-table th { background: var(--surface-hover); padding: var(--space-3) var(--space-4); text-align: left; font-weight: 600; color: var(--text-secondary); }
.report-table td { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-default); color: var(--text-primary); vertical-align: middle; }
.id-cell { font-family: monospace; color: var(--text-muted); }
.time-cell { color: var(--text-muted); white-space: nowrap; }
.status-badge { padding: 2px 8px; border-radius: 999px; font-size: var(--text-xs); font-weight: 600; }
.status-pending { background: #fff8e6; color: #b36200; }
.status-resolved { background: #e6f7ee; color: #1a7a46; }
.status-dismissed { background: var(--surface-hover); color: var(--text-muted); }
.action-cell { white-space: nowrap; }
.action-btn { padding: 2px 10px; border-radius: var(--radius-md); border: 1px solid; font-size: var(--text-xs); cursor: pointer; margin-right: 4px; transition: background 0.12s; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.resolve { border-color: #1a7a46; color: #1a7a46; background: transparent; }
.action-btn.resolve:hover:not(:disabled) { background: #e6f7ee; }
.action-btn.dismiss { border-color: var(--border-default); color: var(--text-muted); background: transparent; }
.action-btn.dismiss:hover:not(:disabled) { background: var(--surface-hover); }
.action-done { color: var(--text-muted); }
/* AI 建议标签 */
.ai-badge { display: inline-block; margin-bottom: 4px; padding: 2px 8px; border-radius: 999px; font-size: var(--text-xs); font-weight: 600; border: none; cursor: pointer; transition: opacity 0.12s; }
.ai-badge:hover { opacity: 0.8; }
.ai-badge.conf-high { background: #e6f7ee; color: #1a7a46; }
.ai-badge.conf-mid  { background: #fff3e0; color: #b36200; }
.ai-badge.conf-low  { background: var(--surface-hover); color: var(--text-muted); }
.ai-badge.ai-badge-done { opacity: 0.5; }
/* 弹窗 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.modal-box { background: var(--surface-card); border-radius: var(--radius-lg); width: 480px; max-width: 92vw; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.18); display: flex; flex-direction: column; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-default); }
.modal-title { font-weight: 700; font-size: var(--text-base); color: var(--text-primary); }
.modal-close { background: none; border: none; cursor: pointer; font-size: 16px; color: var(--text-muted); padding: 2px 6px; border-radius: var(--radius-md); }
.modal-close:hover { background: var(--surface-hover); }
.modal-body { padding: var(--space-4) var(--space-5); display: flex; flex-direction: column; gap: var(--space-3); }
.modal-row { display: flex; gap: var(--space-3); font-size: var(--text-sm); }
.modal-label { color: var(--text-muted); white-space: nowrap; min-width: 80px; }
.modal-value { color: var(--text-primary); flex: 1; word-break: break-word; }
.conf-bar-wrap { display: flex; align-items: center; gap: var(--space-2); flex: 1; }
.conf-bar { display: inline-block; height: 8px; border-radius: 4px; min-width: 4px; }
.conf-bar.conf-high { background: #1a7a46; }
.conf-bar.conf-mid  { background: #b36200; }
.conf-bar.conf-low  { background: var(--text-muted); }
.conf-num { font-size: var(--text-xs); color: var(--text-muted); }
.modal-row-trace { flex-direction: column; gap: var(--space-2); }
.trace-toggle { background: none; border: none; cursor: pointer; font-size: var(--text-xs); color: var(--color-accent); padding: 0; text-align: left; }
.trace-pre { background: var(--surface-hover); border-radius: var(--radius-md); padding: var(--space-3); font-size: 11px; overflow-y: auto; max-height: 300px; white-space: pre-wrap; word-break: break-all; color: var(--text-secondary); margin: 0; }
</style>
