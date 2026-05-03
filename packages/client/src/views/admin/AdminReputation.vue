<script setup lang="ts">
import { ref, onMounted } from 'vue';
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

const loading = ref(false);
const error = ref('');
const items = ref<AuditEntry[]>([]);
const total = ref(0);
const onlySuspicious = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const endpoint = onlySuspicious.value
      ? '/admin/reputation/suspicious?limit=50'
      : '/admin/reputation/audit-log?limit=50';
    const res = await api.get<AuditListResponse>(endpoint);
    items.value = (res as AuditListResponse).items ?? (res as any).data ?? [];
    total.value = (res as AuditListResponse).total ?? items.value.length;
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

onMounted(load);
</script>

<template>
  <div class="admin-reputation">
    <div class="page-header">
      <h1 class="page-title">信誉审计</h1>
      <div class="header-actions">
        <button class="toggle-btn" :class="{ active: onlySuspicious }" @click="toggleSuspicious">
          {{ onlySuspicious ? '显示全部' : '仅显示异常' }}
        </button>
        <button class="refresh-btn" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <div v-if="loading" class="loading-text">加载中…</div>

    <template v-else>
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
</style>
