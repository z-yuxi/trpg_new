<script setup lang="ts">
/**
 * AdminContent.vue — 内容审核工作台
 * 显示处于 reviewing / public_notice 状态的模组与规则包
 * 操作接口：POST /admin/content/{modules|rulesets}/:id/approve|suspend
 */
import { ref, computed, onMounted } from 'vue';
import { api } from '../../utils/api';

type ContentType = 'module' | 'ruleset';

interface ContentItem {
  id: string;
  title?: string;
  name?: string;
  author?: string;
  author_id?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  suspended_reason?: string;
  type: ContentType;
}

const loading = ref(false);
const error = ref('');
const modules = ref<ContentItem[]>([]);
const rulesets = ref<ContentItem[]>([]);
const activeTab = ref<'modules' | 'rulesets'>('modules');
const actionBusy = ref<string | null>(null);

const currentList = computed(() =>
  activeTab.value === 'modules' ? modules.value : rulesets.value
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    // 获取正在审核或公示期的模组（status=reviewing 或 public_notice）
    const [modRes, rsRes] = await Promise.allSettled([
      api.get<{ data: ContentItem[] }>('/modules?status=reviewing&limit=100'),
      api.get<{ data: ContentItem[] }>('/rulesets?status=reviewing&limit=100'),
    ]);
    if (modRes.status === 'fulfilled') {
      modules.value = ((modRes.value as any).data ?? []).map((m: any) => ({ ...m, type: 'module' as ContentType }));
    }
    if (rsRes.status === 'fulfilled') {
      rulesets.value = ((rsRes.value as any).data ?? []).map((r: any) => ({ ...r, type: 'ruleset' as ContentType }));
    }
  } catch (e: any) {
    error.value = e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

async function approve(item: ContentItem) {
  if (!confirm(`确认通过「${item.title ?? item.name}」？`)) return;
  actionBusy.value = item.id;
  try {
    const path = item.type === 'module'
      ? `/admin/content/modules/${item.id}/approve`
      : `/admin/content/rulesets/${item.id}/approve`;
    await api.post(path, {});
    removeItem(item);
  } catch (e: any) {
    alert(e?.message ?? '操作失败');
  } finally {
    actionBusy.value = null;
  }
}

async function suspend(item: ContentItem) {
  const reason = prompt('暂停原因（必填）：');
  if (!reason?.trim()) return;
  actionBusy.value = item.id;
  try {
    const path = item.type === 'module'
      ? `/admin/content/modules/${item.id}/suspend`
      : `/admin/content/rulesets/${item.id}/suspend`;
    await api.post(path, { reason });
    removeItem(item);
  } catch (e: any) {
    alert(e?.message ?? '操作失败');
  } finally {
    actionBusy.value = null;
  }
}

function removeItem(item: ContentItem) {
  if (item.type === 'module') {
    modules.value = modules.value.filter(m => m.id !== item.id);
  } else {
    rulesets.value = rulesets.value.filter(r => r.id !== item.id);
  }
}

function statusLabel(s: string) {
  return { reviewing: '审核中', public_notice: '公示期', suspended: '已暂停', public: '已上架' }[s] ?? s;
}

onMounted(load);
</script>

<template>
  <div class="admin-content">
    <div class="page-header">
      <h1 class="page-title">内容审核</h1>
      <button class="refresh-btn" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- Tab -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'modules' }" @click="activeTab = 'modules'">
        模组 <span class="tab-count">{{ modules.length }}</span>
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'rulesets' }" @click="activeTab = 'rulesets'">
        规则包 <span class="tab-count">{{ rulesets.length }}</span>
      </button>
    </div>

    <div v-if="loading" class="loading-text">加载中…</div>

    <template v-else>
      <div v-if="currentList.length === 0" class="empty-text">当前无待审核内容</div>
      <table v-else class="content-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>作者 ID</th>
            <th>状态</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in currentList" :key="item.id">
            <td class="title-cell">{{ item.title ?? item.name ?? item.id }}</td>
            <td class="id-cell" :title="item.author_id ?? ''">{{ (item.author_id ?? '—').slice(0, 8) }}…</td>
            <td>
              <span class="status-badge" :class="`status-${item.status}`">{{ statusLabel(item.status) }}</span>
            </td>
            <td class="time-cell">{{ item.updated_at ? new Date(item.updated_at).toLocaleString() : '—' }}</td>
            <td class="action-cell">
              <button
                class="action-btn approve"
                :disabled="actionBusy === item.id"
                @click="approve(item)"
              >通过</button>
              <button
                class="action-btn suspend"
                :disabled="actionBusy === item.id"
                @click="suspend(item)"
              >暂停</button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped>
.admin-content { max-width: 1000px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-5); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); }
.refresh-btn { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); cursor: pointer; font-size: var(--text-sm); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error-banner { background: #fff0f0; color: #c00; border: 1px solid #fcc; border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); }
.tab-bar { display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--border-default); }
.tab-btn { padding: var(--space-2) var(--space-4); border: none; background: transparent; font-size: var(--text-sm); color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s; }
.tab-btn.active { color: var(--color-primary); border-bottom-color: var(--color-primary); font-weight: 600; }
.tab-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; background: var(--surface-hover); border-radius: 999px; font-size: var(--text-xs); margin-left: 4px; }
.loading-text, .empty-text { color: var(--text-muted); font-size: var(--text-sm); padding: var(--space-4); }
.content-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); background: var(--surface-card); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border-default); }
.content-table th { background: var(--surface-hover); padding: var(--space-3) var(--space-4); text-align: left; font-weight: 600; color: var(--text-secondary); }
.content-table td { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border-default); vertical-align: middle; }
.title-cell { font-weight: 500; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.id-cell { font-family: monospace; color: var(--text-muted); }
.time-cell { color: var(--text-muted); white-space: nowrap; }
.status-badge { padding: 2px 8px; border-radius: 999px; font-size: var(--text-xs); font-weight: 600; }
.status-reviewing { background: #e8f0fe; color: #1a56c4; }
.status-public_notice { background: #fff8e6; color: #b36200; }
.status-suspended { background: #fff0f0; color: #c00; }
.action-cell { white-space: nowrap; }
.action-btn { padding: 2px 10px; border-radius: var(--radius-md); border: 1px solid; font-size: var(--text-xs); cursor: pointer; margin-right: 4px; transition: background 0.12s; }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn.approve { border-color: #1a7a46; color: #1a7a46; background: transparent; }
.action-btn.approve:hover:not(:disabled) { background: #e6f7ee; }
.action-btn.suspend { border-color: #fcc; color: #c00; background: transparent; }
.action-btn.suspend:hover:not(:disabled) { background: #fff0f0; }
</style>
