<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../utils/api';

interface AuditEntry {
  id: string;
  user_id: string;
  reviewer_id?: string;
  campaign_id?: string;
  delta: number;
  reason?: string;
  anti_cheat_flag?: boolean;
  created_at: string;
}

interface AuditListResponse {
  items: AuditEntry[];
  total: number;
}

interface Appeal {
  id: string;
  review_id: string;
  appellant_id: string;
  reason: string;
  status: string;
  created_at: string;
}

interface AppealListResponse {
  items: Appeal[];
  total: number;
}

const activeTab = ref<'audit' | 'appeals'>('audit');
const loading = ref(false);
const error = ref('');

// 审计日志
const items = ref<AuditEntry[]>([]);
const total = ref(0);
const onlySuspicious = ref(false);

// 申诉
const appeals = ref<Appeal[]>([]);
const appealTotal = ref(0);
const appealBusy = ref<string | null>(null);

async function loadAudit() {
  const endpoint = onlySuspicious.value
    ? '/admin/reputation/suspicious?limit=50'
    : '/admin/reputation/audit-log?limit=50';
  const res = await api.get<AuditListResponse>(endpoint);
  items.value = (res as AuditListResponse).items ?? (res as any).data ?? [];
  total.value = (res as AuditListResponse).total ?? items.value.length;
}

async function loadAppeals() {
  const res = await api.get<AppealListResponse>('/admin/reviews/appeals?limit=50');
  appeals.value = (res as AppealListResponse).items ?? (res as any).data ?? [];
  appealTotal.value = (res as AppealListResponse).total ?? appeals.value.length;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    if (activeTab.value === 'audit') {
      await loadAudit();
    } else {
      await loadAppeals();
    }
  } catch (e: any) {
    error.value = e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

function toggleSuspicious() {
  onlySuspicious.value = !onlySuspicious.value;
  load();
}

async function resolveAppeal(appeal: Appeal, decision: 'resolved_remove' | 'resolved_keep') {
  const note = prompt(`处理备注（${decision === 'resolved_remove' ? '撤销信誉扣分' : '维持原判'}）：`);
  if (note === undefined) return; // cancelled
  appealBusy.value = appeal.id;
  try {
    await api.post(`/admin/reviews/appeals/${appeal.id}/resolve`, {
      decision,
      resolution_note: note || undefined,
    });
    appeals.value = appeals.value.filter(a => a.id !== appeal.id);
    appealTotal.value = Math.max(0, appealTotal.value - 1);
  } catch (e: any) {
    alert(e?.message ?? '操作失败');
  } finally {
    appealBusy.value = null;
  }
}

function appealStatusLabel(s: string) {
  return { pending: '待处理', resolved_remove: '已撤销', resolved_keep: '已维持' }[s] ?? s;
}

function switchTab(tab: 'audit' | 'appeals') {
  activeTab.value = tab;
  load();
}

onMounted(load);
</script>

<template>
  <div class="admin-reputation">
    <div class="page-header">
      <h1 class="page-title">信誉审计</h1>
      <div class="header-actions">
        <template v-if="activeTab === 'audit'">
          <button class="toggle-btn" :class="{ active: onlySuspicious }" @click="toggleSuspicious">
            {{ onlySuspicious ? '显示全部' : '仅显示异常' }}
          </button>
        </template>
        <button class="refresh-btn" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'audit' }" @click="switchTab('audit')">信誉变动日志</button>
      <button class="tab-btn" :class="{ active: activeTab === 'appeals' }" @click="switchTab('appeals')">
        申诉处理 <span v-if="appealTotal > 0" class="tab-count">{{ appealTotal }}</span>
      </button>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading-text">加载中…</div>

    <!-- 审计日志 -->
    <template v-else-if="activeTab === 'audit'">
      <p class="summary-text">共 {{ total }} 条{{ onlySuspicious ? '（仅异常）' : '' }}</p>
      <div v-if="items.length === 0" class="empty-text">暂无记录</div>
      <table v-else class="audit-table">
        <thead>
          <tr>
            <th>用户 ID</th>
            <th>变动值</th>
            <th>原因</th>
            <th>异常</th>
            <th>战役</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id" :class="{ 'row-suspicious': item.anti_cheat_flag }">
            <td class="id-cell" :title="item.user_id">{{ item.user_id.slice(0, 8) }}…</td>
            <td>
              <span class="delta" :class="item.delta >= 0 ? 'delta-up' : 'delta-down'">
                {{ item.delta >= 0 ? '+' : '' }}{{ item.delta }}
              </span>
            </td>
            <td>{{ item.reason ?? '—' }}</td>
            <td>
              <span v-if="item.anti_cheat_flag" class="flag-badge">⚠ 标记</span>
              <span v-else class="flag-ok">—</span>
            </td>
            <td class="id-cell" :title="item.campaign_id ?? ''">
              {{ item.campaign_id ? item.campaign_id.slice(0, 8) + '…' : '—' }}
            </td>
            <td class="time-cell">{{ item.created_at ? new Date(item.created_at).toLocaleString() : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- 申诉处理 -->
    <template v-else-if="activeTab === 'appeals'">
      <p class="summary-text">待处理 {{ appealTotal }} 条</p>
      <div v-if="appeals.length === 0" class="empty-text">暂无待处理申诉</div>
      <table v-else class="audit-table">
        <thead>
          <tr>
            <th>申请人 ID</th>
            <th>申诉理由</th>
            <th>状态</th>
            <th>时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ap in appeals" :key="ap.id">
            <td class="id-cell" :title="ap.appellant_id">{{ ap.appellant_id.slice(0, 8) }}…</td>
            <td>{{ ap.reason }}</td>
            <td>
              <span class="status-badge" :class="`appeal-${ap.status}`">{{ appealStatusLabel(ap.status) }}</span>
            </td>
            <td class="time-cell">{{ ap.created_at ? new Date(ap.created_at).toLocaleString() : '—' }}</td>
            <td class="action-cell">
              <template v-if="ap.status === 'pending'">
                <button class="action-btn remove" :disabled="appealBusy === ap.id" @click="resolveAppeal(ap, 'resolved_remove')">撤销扣分</button>
                <button class="action-btn keep" :disabled="appealBusy === ap.id" @click="resolveAppeal(ap, 'resolved_keep')">维持原判</button>
              </template>
              <span v-else class="action-done">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.admin-reputation { max-width: 1000px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); }
.header-actions { display: flex; gap: var(--space-2); }
.refresh-btn, .toggle-btn { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); cursor: pointer; font-size: var(--text-sm); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.toggle-btn.active { background: var(--color-primary-subtle); border-color: var(--color-primary); color: var(--color-primary); }
.error-banner { background: #fff0f0; color: #c00; border: 1px solid #fcc; border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); }
.loading-text, .empty-text { color: var(--text-muted); font-size: var(--text-sm); padding: var(--space-4); }
.summary-text { font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-3); }
.audit-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); background: var(--surface-card); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border-default); }
.audit-table th { background: var(--surface-hover); padding: var(--space-3) var(--space-4); text-align: left; font-weight: 600; color: var(--text-secondary); }
.audit-table td { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-default); vertical-align: middle; }
.row-suspicious { background: #fff8f0; }
.id-cell { font-family: monospace; color: var(--text-muted); }
.time-cell { color: var(--text-muted); white-space: nowrap; }
.delta { font-weight: 700; }
.delta-up { color: #1a7a46; }
.delta-down { color: #c00; }
.flag-badge { background: #fff0f0; color: #c00; border: 1px solid #fcc; border-radius: 4px; padding: 1px 6px; font-size: var(--text-xs); font-weight: 600; }
.flag-ok { color: var(--text-muted); }
.tab-bar { display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border-default); }
.tab-btn { padding: var(--space-2) var(--space-4); border: none; background: transparent; font-size: var(--text-sm); color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s; }
.tab-btn.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
.tab-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; background: #fff0f0; color: #c00; border-radius: 999px; font-size: var(--text-xs); margin-left: 4px; }
.status-badge { padding: 2px 8px; border-radius: 999px; font-size: var(--text-xs); font-weight: 600; }
.appeal-pending { background: #fff8e6; color: #b36200; }
.appeal-resolved_remove { background: #e6f7ee; color: #1a7a46; }
.appeal-resolved_keep { background: var(--surface-hover); color: var(--text-muted); }
.action-cell { white-space: nowrap; }
.action-btn { padding: 2px 10px; border-radius: var(--radius-md); border: 1px solid; font-size: var(--text-xs); cursor: pointer; margin-right: 4px; transition: background 0.12s; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.remove { border-color: #1a7a46; color: #1a7a46; background: transparent; }
.action-btn.remove:hover:not(:disabled) { background: #e6f7ee; }
.action-btn.keep { border-color: var(--border-default); color: var(--text-muted); background: transparent; }
.action-btn.keep:hover:not(:disabled) { background: var(--surface-hover); }
.action-done { color: var(--text-muted); }
</style>
