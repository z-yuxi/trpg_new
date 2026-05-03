<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../utils/api';

interface FunnelSnapshot {
  published?: number;
  applied?: number;
  formed?: number;
  [key: string]: unknown;
}

interface DailyReport {
  date: string;
  published?: number;
  formed?: number;
  [key: string]: unknown;
}

interface AlertItem {
  name: string;
  level: string;
  status: string;
  message?: string;
}

const loading = ref(false);
const error = ref('');
const funnel = ref<FunnelSnapshot | null>(null);
const daily = ref<DailyReport[]>([]);
const alerts = ref<AlertItem[]>([]);
const funnelDays = ref(7);
const dailyDays = ref(14);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [funnelRes, dailyRes, alertsRes] = await Promise.allSettled([
      api.get<FunnelSnapshot>(`/metrics/recruitment/funnel?days=${funnelDays.value}`),
      api.get<{ reports: DailyReport[] }>(`/metrics/recruitment/daily?days=${dailyDays.value}`),
      api.get<{ alerts: AlertItem[] }>(`/metrics/recruitment/alerts?days=7`),
    ]);
    if (funnelRes.status === 'fulfilled') funnel.value = funnelRes.value as FunnelSnapshot;
    if (dailyRes.status === 'fulfilled') daily.value = ((dailyRes.value as any).reports ?? []) as DailyReport[];
    if (alertsRes.status === 'fulfilled') alerts.value = ((alertsRes.value as any).alerts ?? []) as AlertItem[];
  } catch (e: any) {
    error.value = e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

async function invalidateCache() {
  if (!confirm('确定清除招募指标缓存？')) return;
  try {
    await api.post('/metrics/recruitment/cache/invalidate', {});
    alert('缓存已失效');
    load();
  } catch (e: any) {
    alert(e?.message ?? '操作失败');
  }
}

onMounted(load);
</script>

<template>
  <div class="admin-metrics">
    <div class="page-header">
      <h1 class="page-title">运营指标</h1>
      <div class="header-actions">
        <button class="danger-btn" @click="invalidateCache">清除缓存</button>
        <button class="refresh-btn" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
      </div>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>
    <div v-if="loading" class="loading-text">加载中…</div>

    <template v-else>
      <!-- 漏斗 -->
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">招募漏斗（近 {{ funnelDays }} 天）</h2>
          <select v-model="funnelDays" class="days-select" @change="load">
            <option :value="7">7 天</option>
            <option :value="14">14 天</option>
            <option :value="30">30 天</option>
          </select>
        </div>
        <div v-if="funnel" class="funnel-grid">
          <div v-for="(val, key) in funnel" :key="key" class="funnel-card">
            <div class="funnel-key">{{ key }}</div>
            <div class="funnel-val">{{ val }}</div>
          </div>
        </div>
        <p v-else class="empty-text">暂无漏斗数据</p>
      </section>

      <!-- 异常告警 -->
      <section class="section">
        <h2 class="section-title">招募异常告警</h2>
        <div v-if="alerts.length === 0" class="empty-text">无异常</div>
        <div v-else class="alert-list">
          <div v-for="a in alerts" :key="a.name" class="alert-row" :class="`alert-${a.status}`">
            <span class="alert-name">{{ a.name }}</span>
            <span class="alert-level">{{ a.level }}</span>
            <span class="alert-status">{{ a.status }}</span>
            <span v-if="a.message" class="alert-msg">{{ a.message }}</span>
          </div>
        </div>
      </section>

      <!-- 每日日报 -->
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">招募日报（近 {{ dailyDays }} 天）</h2>
          <select v-model="dailyDays" class="days-select" @change="load">
            <option :value="7">7 天</option>
            <option :value="14">14 天</option>
            <option :value="30">30 天</option>
          </select>
        </div>
        <div v-if="daily.length === 0" class="empty-text">暂无日报数据</div>
        <table v-else class="daily-table">
          <thead>
            <tr>
              <th>日期</th>
              <th v-for="key in Object.keys(daily[0] ?? {}).filter(k => k !== 'date')" :key="key">{{ key }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in daily" :key="row.date">
              <td>{{ row.date }}</td>
              <td v-for="key in Object.keys(row).filter(k => k !== 'date')" :key="key">{{ row[key] }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-metrics { max-width: 1000px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); }
.header-actions { display: flex; gap: var(--space-2); }
.refresh-btn, .danger-btn { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); cursor: pointer; font-size: var(--text-sm); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.danger-btn { border-color: #fcc; color: #c00; }
.danger-btn:hover { background: #fff0f0; }
.error-banner { background: #fff0f0; color: #c00; border: 1px solid #fcc; border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); }
.loading-text, .empty-text { color: var(--text-muted); font-size: var(--text-sm); padding: var(--space-4); }
.section { margin-bottom: var(--space-8); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-title { font-size: var(--text-base); font-weight: 600; color: var(--text-secondary); }
.days-select { padding: var(--space-1) var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md); font-size: var(--text-sm); }
.funnel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: var(--space-3); }
.funnel-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); }
.funnel-key { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-1); }
.funnel-val { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
.alert-list { display: flex; flex-direction: column; gap: var(--space-1); }
.alert-row { display: grid; grid-template-columns: 1fr 60px 80px 2fr; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--surface-card); font-size: var(--text-sm); }
.alert-firing { border-left: 3px solid #c00; }
.alert-ok { border-left: 3px solid #1a7a46; }
.alert-name { font-weight: 500; }
.alert-level, .alert-status { color: var(--text-muted); }
.alert-msg { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.daily-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); background: var(--surface-card); border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--border-default); }
.daily-table th { background: var(--surface-hover); padding: var(--space-2) var(--space-3); text-align: left; font-weight: 600; color: var(--text-secondary); }
.daily-table td { padding: var(--space-2) var(--space-3); border-top: 1px solid var(--border-default); }
</style>
