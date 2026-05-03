<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../../utils/api';

interface BusinessMetrics {
  campaigns_started?: number;
  campaigns_completed?: number;
  messages_sent?: number;
  active_connections?: number;
  [key: string]: unknown;
}

interface AlertRule {
  name: string;
  level: string;
  status: string;
  message?: string;
}

interface AlertsResponse {
  has_p0: boolean;
  has_p1: boolean;
  firing_count: number;
  rules: AlertRule[];
  timestamp: string;
}

const loading = ref(false);
const error = ref('');
const metrics = ref<BusinessMetrics | null>(null);
const alertsData = ref<AlertsResponse | null>(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [metricsRes, alertsRes] = await Promise.allSettled([
      api.get<BusinessMetrics>('/metrics/business'),
      api.get<AlertsResponse>('/metrics/alerts'),
    ]);
    if (metricsRes.status === 'fulfilled') metrics.value = metricsRes.value as BusinessMetrics;
    if (alertsRes.status === 'fulfilled') alertsData.value = alertsRes.value as AlertsResponse;
  } catch (e: any) {
    error.value = e?.message ?? '加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="admin-dashboard">
    <div class="page-header">
      <h1 class="page-title">后台概览</h1>
      <button class="refresh-btn" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
    </div>

    <div v-if="error" class="error-banner">{{ error }}</div>

    <!-- 告警状态 -->
    <section class="section">
      <h2 class="section-title">告警状态</h2>
      <div v-if="alertsData" class="alert-summary">
        <span class="badge" :class="alertsData.has_p0 ? 'badge-danger' : 'badge-ok'">
          P0 {{ alertsData.has_p0 ? '触发' : '正常' }}
        </span>
        <span class="badge" :class="alertsData.has_p1 ? 'badge-warn' : 'badge-ok'">
          P1 {{ alertsData.has_p1 ? '触发' : '正常' }}
        </span>
        <span class="badge-text">共 {{ alertsData.firing_count }} 条触发中</span>
        <span class="time-hint">{{ alertsData.timestamp ? new Date(alertsData.timestamp).toLocaleTimeString() : '' }}</span>
      </div>
      <div v-if="alertsData?.rules?.length" class="alert-rules">
        <div
          v-for="rule in alertsData.rules"
          :key="rule.name"
          class="rule-row"
          :class="`rule-${rule.status}`"
        >
          <span class="rule-name">{{ rule.name }}</span>
          <span class="rule-level">{{ rule.level }}</span>
          <span class="rule-status">{{ rule.status }}</span>
          <span v-if="rule.message" class="rule-msg">{{ rule.message }}</span>
        </div>
      </div>
      <p v-else-if="!loading" class="empty-text">无告警数据</p>
    </section>

    <!-- 业务指标快照 -->
    <section class="section">
      <h2 class="section-title">业务指标快照</h2>
      <div v-if="metrics" class="metrics-grid">
        <div v-for="(val, key) in metrics" :key="key" class="metric-card">
          <div class="metric-key">{{ key }}</div>
          <div class="metric-val">{{ val }}</div>
        </div>
      </div>
      <p v-else-if="!loading" class="empty-text">无指标数据</p>
    </section>

    <!-- 快捷入口 -->
    <section class="section">
      <h2 class="section-title">快捷入口</h2>
      <div class="quick-links">
        <RouterLink to="/admin/reports" class="quick-link">举报处理</RouterLink>
        <RouterLink to="/admin/reputation" class="quick-link">信誉审计</RouterLink>
        <RouterLink to="/admin/metrics" class="quick-link">招募指标</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.admin-dashboard { max-width: 900px; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); }
.refresh-btn { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: var(--surface-card); cursor: pointer; font-size: var(--text-sm); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.error-banner { background: var(--color-danger-subtle, #fff0f0); color: var(--color-danger, #c00); border: 1px solid var(--color-danger-border, #fcc); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4); }
.section { margin-bottom: var(--space-8); }
.section-title { font-size: var(--text-base); font-weight: 600; color: var(--text-secondary); margin-bottom: var(--space-3); }
.alert-summary { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
.badge { padding: 2px 10px; border-radius: 999px; font-size: var(--text-sm); font-weight: 600; }
.badge-ok { background: #e6f7ee; color: #1a7a46; }
.badge-danger { background: #fff0f0; color: #c00; }
.badge-warn { background: #fff8e6; color: #b36200; }
.badge-text { font-size: var(--text-sm); color: var(--text-muted); }
.time-hint { font-size: var(--text-xs); color: var(--text-muted); margin-left: auto; }
.alert-rules { display: flex; flex-direction: column; gap: var(--space-1); }
.rule-row { display: grid; grid-template-columns: 1fr 60px 80px 2fr; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); font-size: var(--text-sm); background: var(--surface-card); }
.rule-firing { border-left: 3px solid var(--color-danger, #c00); }
.rule-ok { border-left: 3px solid #1a7a46; }
.rule-cooldown { border-left: 3px solid #b36200; }
.rule-name { font-weight: 500; }
.rule-level { color: var(--text-muted); }
.rule-status { color: var(--text-secondary); }
.rule-msg { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--space-3); }
.metric-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); }
.metric-key { font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-1); }
.metric-val { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
.quick-links { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.quick-link { padding: var(--space-2) var(--space-4); background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-md); text-decoration: none; color: var(--text-primary); font-size: var(--text-sm); transition: background 0.15s; }
.quick-link:hover { background: var(--surface-hover); }
.empty-text { color: var(--text-muted); font-size: var(--text-sm); }
</style>
