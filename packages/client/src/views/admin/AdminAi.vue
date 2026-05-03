<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../../utils/api';

interface DailyRow { day: string; task_type: string; status: string; count: number | string; }
interface TokenRow  { task_type: string; total_input: number | string; total_output: number | string; }
interface TopUser   { uid_prefix: string; task_type: string; count: number; }
interface SummaryRow { status: string; count: number | string; }

const loading = ref(false);
const error   = ref('');

const daily       = ref<DailyRow[]>([]);
const tokenTotals = ref<TokenRow[]>([]);
const topUsers    = ref<TopUser[]>([]);
const summary     = ref<SummaryRow[]>([]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get<{
      daily: DailyRow[];
      token_totals: TokenRow[];
      top_users: TopUser[];
      summary: SummaryRow[];
    }>('/admin/ai/stats');
    daily.value       = res.daily ?? [];
    tokenTotals.value = res.token_totals ?? [];
    topUsers.value    = res.top_users ?? [];
    summary.value     = res.summary ?? [];
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// ── 汇总卡片数值 ────────────────────────────────────────
const totalCalls    = computed(() => summary.value.reduce((s, r) => s + Number(r.count), 0));
const successCalls  = computed(() => Number(summary.value.find((r) => r.status === 'success')?.count ?? 0));
const failedCalls   = computed(() => Number(summary.value.find((r) => r.status === 'failed')?.count ?? 0));
const successRate   = computed(() => totalCalls.value > 0
  ? ((successCalls.value / totalCalls.value) * 100).toFixed(1) + '%'
  : '--');

// ── 每日数据：折叠到 task_type 维度 ─────────────────────
const TASK_LABELS: Record<string, string> = {
  check_text:      'AI 校对',
  import_module:   '结构分析',
  log_summary:     '日志摘要',
  generate_recipe: '规则生成',
};

function taskLabel(type: string) {
  return TASK_LABELS[type] ?? type;
}

// ── 每日汇总（只按 day 聚合）────────────────────────────
interface DayStat { day: string; total: number; success: number; failed: number; }
const dailyStats = computed<DayStat[]>(() => {
  const map = new Map<string, DayStat>();
  for (const row of daily.value) {
    const entry = map.get(row.day) ?? { day: row.day, total: 0, success: 0, failed: 0 };
    const cnt = Number(row.count);
    entry.total   += cnt;
    if (row.status === 'success') entry.success += cnt;
    if (row.status === 'failed')  entry.failed  += cnt;
    map.set(row.day, entry);
  }
  return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
});

// ── Token 汇总 ──────────────────────────────────────────
const totalInputTokens  = computed(() =>
  tokenTotals.value.reduce((s, r) => s + Number(r.total_input), 0));
const totalOutputTokens = computed(() =>
  tokenTotals.value.reduce((s, r) => s + Number(r.total_output), 0));
</script>

<template>
  <div class="admin-ai-page">
    <header class="page-header">
      <h1 class="page-title">AI 监控台</h1>
      <p class="page-subtitle">近 30 天 AI 功能使用统计（只读视图，所有操作均需人工审批）</p>
      <button class="btn btn--secondary btn--sm" :disabled="loading" @click="load">
        {{ loading ? '加载中...' : '刷新' }}
      </button>
    </header>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- 汇总卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-value">{{ totalCalls }}</div>
        <div class="stat-label">总调用次数</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-value">{{ successCalls }}</div>
        <div class="stat-label">成功次数</div>
      </div>
      <div class="stat-card stat-card--failed">
        <div class="stat-value">{{ failedCalls }}</div>
        <div class="stat-label">失败次数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ successRate }}</div>
        <div class="stat-label">成功率</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalInputTokens.toLocaleString() }}</div>
        <div class="stat-label">输入 Tokens</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ totalOutputTokens.toLocaleString() }}</div>
        <div class="stat-label">输出 Tokens</div>
      </div>
    </div>

    <div class="grid-2col">
      <!-- 每日统计表 -->
      <section class="panel">
        <h2 class="panel-title">每日调用趋势（近 30 天）</h2>
        <div v-if="dailyStats.length === 0 && !loading" class="empty">暂无数据</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>日期</th>
              <th class="text-right">总调用</th>
              <th class="text-right">成功</th>
              <th class="text-right">失败</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in dailyStats" :key="row.day">
              <td>{{ row.day }}</td>
              <td class="text-right">{{ row.total }}</td>
              <td class="text-right success-text">{{ row.success }}</td>
              <td class="text-right" :class="row.failed > 0 ? 'failed-text' : ''">{{ row.failed }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Token 消耗 -->
      <section class="panel">
        <h2 class="panel-title">Token 消耗（按任务类型）</h2>
        <div v-if="tokenTotals.length === 0 && !loading" class="empty">暂无数据</div>
        <table v-else class="data-table">
          <thead>
            <tr>
              <th>任务类型</th>
              <th class="text-right">输入 Tokens</th>
              <th class="text-right">输出 Tokens</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tokenTotals" :key="row.task_type">
              <td>{{ taskLabel(row.task_type) }}</td>
              <td class="text-right">{{ Number(row.total_input).toLocaleString() }}</td>
              <td class="text-right">{{ Number(row.total_output).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <!-- Top 用户 -->
    <section class="panel panel--full">
      <h2 class="panel-title">
        Top 用户（近 30 天，ID 脱敏）
        <span class="panel-title-note">仅展示建议数据，不可直接执行任何处罚</span>
      </h2>
      <div v-if="topUsers.length === 0 && !loading" class="empty">暂无数据</div>
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>用户 ID 前缀</th>
            <th>任务类型</th>
            <th class="text-right">调用次数</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, idx) in topUsers" :key="idx">
            <td class="mono">{{ row.uid_prefix }}****</td>
            <td>{{ taskLabel(row.task_type) }}</td>
            <td class="text-right">{{ row.count }}</td>
          </tr>
        </tbody>
      </table>
      <p class="notice">
        注意：AI 模块监控为只读建议视图。任何基于 AI 数据的处置操作（如限流、封号）须由管理员在「信誉审计」或「内容审核」模块手动执行，不可由 AI 直接触发。
      </p>
    </section>
  </div>
</template>

<style scoped>
.admin-ai-page {
  padding: 24px;
  max-width: 1100px;
}
.page-header {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  margin-bottom: 24px;
}
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.page-subtitle { font-size: 13px; color: var(--color-text-muted, #aaa); flex: 1; margin: 0; }
.error-banner {
  background: #fee2e2; color: #991b1b; border-radius: 6px;
  padding: 10px 14px; margin-bottom: 16px; font-size: 13px;
}
.stat-cards {
  display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;
}
.stat-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #eee);
  border-radius: 8px; padding: 16px 20px; min-width: 120px;
}
.stat-card--success .stat-value { color: #059669; }
.stat-card--failed  .stat-value { color: #dc2626; }
.stat-value { font-size: 24px; font-weight: 700; line-height: 1.2; }
.stat-label { font-size: 12px; color: var(--color-text-muted, #aaa); margin-top: 4px; }
.grid-2col {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;
}
@media (max-width: 768px) {
  .grid-2col { grid-template-columns: 1fr; }
}
.panel {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #eee);
  border-radius: 8px; padding: 16px; overflow: hidden;
}
.panel--full { margin-bottom: 0; }
.panel-title {
  font-size: 14px; font-weight: 700;
  margin: 0 0 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.panel-title-note {
  font-size: 11px; font-weight: 400;
  color: var(--color-text-muted, #aaa);
  background: #fef3c7; color: #92400e;
  padding: 2px 6px; border-radius: 4px;
}
.data-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.data-table th {
  text-align: left; font-size: 11px; font-weight: 600;
  color: var(--color-text-muted, #aaa);
  border-bottom: 1px solid var(--color-border, #eee);
  padding: 6px 8px;
}
.data-table td {
  padding: 7px 8px;
  border-bottom: 1px solid var(--color-border-light, #f5f5f5);
}
.data-table tr:last-child td { border-bottom: none; }
.text-right { text-align: right; }
.success-text { color: #059669; }
.failed-text  { color: #dc2626; font-weight: 600; }
.mono { font-family: monospace; letter-spacing: 0.03em; }
.empty {
  text-align: center; padding: 32px; font-size: 13px;
  color: var(--color-text-muted, #aaa);
}
.notice {
  margin-top: 12px; padding: 10px 12px;
  background: #fef9e7; border-left: 3px solid #f59e0b;
  border-radius: 0 4px 4px 0;
  font-size: 12px; color: #78350f; line-height: 1.6;
}
.btn { padding: 6px 14px; border-radius: 6px; border: 1px solid; cursor: pointer; font-size: 13px; }
.btn--secondary { background: none; border-color: var(--color-border, #ccc); color: var(--color-text, #333); }
.btn--sm { padding: 4px 10px; font-size: 12px; }
</style>
