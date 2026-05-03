<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../utils/api';

interface Report {
  id: string;
  reporter_user_id: string;
  content_type: string;
  content_id: string;
  reason: string;
  status: string;
  created_at: string;
}

const loading = ref(false);
const error = ref('');
const reports = ref<Report[]>([]);

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

function statusLabel(s: string) {
  return { pending: '待处理', resolved: '已处理', dismissed: '已忽略' }[s] ?? s;
}

function typeLabel(t: string) {
  return { message: '消息', post: '帖子', user: '用户' }[t] ?? t;
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
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.admin-reports { max-width: 1000px; }
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
</style>
