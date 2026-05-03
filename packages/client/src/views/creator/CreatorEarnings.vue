<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageLayout from '../../components/layout/PageLayout.vue';
import TCard from '../../components/base/TCard.vue';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';
import {
  getCreatorEarnings, applyWithdrawal, listEarningsSales, listWithdrawals,
  type EarningsSummary, type SaleItem, type WithdrawalItem,
} from '../../api/creator';

const activeTab = ref<'withdraw' | 'sales' | 'history'>('withdraw');
const loading = ref(false);
const withdrawLoading = ref(false);
const salesLoading = ref(false);
const historyLoading = ref(false);
const salesLoaded = ref(false);
const historyLoaded = ref(false);

const earnings = ref<EarningsSummary | null>(null);
const sales = ref<SaleItem[]>([]);
const withdrawals = ref<WithdrawalItem[]>([]);

const withdrawAmount = ref<number>(0);
const withdrawAccount = ref('');
const withdrawChannel = ref<'alipay' | 'wechat' | 'bank'>('alipay');

async function loadEarnings() {
  loading.value = true;
  try {
    earnings.value = await getCreatorEarnings();
  } catch {
    ElMessage.error('收益数据加载失败');
  } finally {
    loading.value = false;
  }
}

async function loadSales() {
  if (salesLoaded.value) return;
  salesLoading.value = true;
  try {
    const res = await listEarningsSales(1, 50);
    sales.value = res.data ?? [];
    salesLoaded.value = true;
  } catch {
    ElMessage.error('销售明细加载失败');
  } finally {
    salesLoading.value = false;
  }
}

async function loadHistory() {
  if (historyLoaded.value) return;
  historyLoading.value = true;
  try {
    const res = await listWithdrawals(1, 50);
    withdrawals.value = res.data ?? [];
    historyLoaded.value = true;
  } catch {
    ElMessage.error('提现历史加载失败');
  } finally {
    historyLoading.value = false;
  }
}

function switchTab(tab: typeof activeTab.value) {
  activeTab.value = tab;
  if (tab === 'sales') loadSales();
  if (tab === 'history') loadHistory();
}

async function submitWithdrawal() {
  if (!withdrawAmount.value || withdrawAmount.value <= 0) {
    ElMessage.warning('请输入提现金额');
    return;
  }
  if (!withdrawAccount.value.trim()) {
    ElMessage.warning('请填写收款账号');
    return;
  }
  if (!earnings.value || withdrawAmount.value > earnings.value.available_balance) {
    ElMessage.warning('提现金额超过可用余额');
    return;
  }

  const channelLabel = { alipay: '支付宝', wechat: '微信', bank: '银行卡' }[withdrawChannel.value];
  await ElMessageBox.confirm(
    `确认提现 ¥${withdrawAmount.value.toFixed(2)} 到 ${channelLabel} ${withdrawAccount.value}？`,
    '申请提现',
    { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
  );

  withdrawLoading.value = true;
  try {
    await applyWithdrawal(withdrawAmount.value, withdrawChannel.value, withdrawAccount.value.trim());
    ElMessage.success('提现申请已提交，预计 3-5 个工作日到账');
    withdrawAmount.value = 0;
    withdrawAccount.value = '';
    historyLoaded.value = false; // 刷新历史
    await loadEarnings();
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '提现申请失败');
  } finally {
    withdrawLoading.value = false;
  }
}

function centsToYuan(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

function withdrawalStatusLabel(status: string) {
  return { pending: '待处理', processing: '处理中', done: '已到账', rejected: '已拒绝' }[status] ?? status;
}
function withdrawalStatusColor(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'done') return 'success';
  if (status === 'processing' || status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'default';
}

onMounted(loadEarnings);
</script>

<template>
  <PageLayout title="创作者收益">
    <div v-loading="loading" class="earnings-page">

      <!-- 收益概览 -->
      <div class="overview-grid">
        <TCard padding="md" class="overview-card">
          <div class="card-label">累计收益</div>
          <div class="card-value">¥{{ (earnings?.total_earnings ?? 0).toFixed(2) }}</div>
        </TCard>
        <TCard padding="md" class="overview-card">
          <div class="card-label">可提现余额</div>
          <div class="card-value highlight">¥{{ (earnings?.available_balance ?? 0).toFixed(2) }}</div>
        </TCard>
        <TCard padding="md" class="overview-card">
          <div class="card-label">提现中</div>
          <div class="card-value">¥{{ (earnings?.pending_withdrawal ?? 0).toFixed(2) }}</div>
        </TCard>
        <TCard padding="md" class="overview-card">
          <div class="card-label">本月收益</div>
          <div class="card-value">¥{{ (earnings?.this_month ?? 0).toFixed(2) }}</div>
        </TCard>
      </div>

      <!-- Tab 切换 -->
      <div class="tab-bar">
        <button class="tab-btn" :class="{ active: activeTab === 'withdraw' }" @click="switchTab('withdraw')">申请提现</button>
        <button class="tab-btn" :class="{ active: activeTab === 'sales' }" @click="switchTab('sales')">销售明细</button>
        <button class="tab-btn" :class="{ active: activeTab === 'history' }" @click="switchTab('history')">提现记录</button>
      </div>

      <!-- 申请提现 -->
      <TCard v-if="activeTab === 'withdraw'" padding="lg" class="withdraw-card">
        <h2 class="section-title">申请提现</h2>
        <div class="withdraw-form">
          <div class="form-row">
            <label class="form-label">提现金额（元）</label>
            <input
              v-model.number="withdrawAmount"
              type="number"
              min="10"
              step="0.01"
              class="form-input"
              placeholder="最低提现 ¥10"
            />
          </div>
          <div class="form-row">
            <label class="form-label">收款方式</label>
            <div class="radio-group">
              <label><input v-model="withdrawChannel" type="radio" value="alipay" /> 支付宝</label>
              <label><input v-model="withdrawChannel" type="radio" value="wechat" /> 微信</label>
              <label><input v-model="withdrawChannel" type="radio" value="bank" /> 银行卡</label>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">
              {{ withdrawChannel === 'alipay' ? '支付宝账号' : withdrawChannel === 'wechat' ? '微信号' : '银行卡号' }}
            </label>
            <input
              v-model="withdrawAccount"
              type="text"
              class="form-input"
              placeholder="请输入收款账号"
            />
          </div>
          <div class="form-actions">
            <TButton type="primary" :loading="withdrawLoading" @click="submitWithdrawal">提交提现申请</TButton>
            <span v-if="earnings && earnings.available_balance < 10" class="no-balance-hint">可用余额不足 ¥10</span>
          </div>
        </div>
        <p class="withdraw-hint">提现年费制即提现手续费，预计 3-5 个工作日到账。单次最低提现金额为 ¥10。</p>
      </TCard>

      <!-- 销售明细 -->
      <TCard v-else-if="activeTab === 'sales'" padding="lg">
        <h2 class="section-title">销售明细</h2>
        <div v-if="salesLoading" class="loading-hint">加载中…</div>
        <div v-else-if="sales.length === 0" class="empty-hint">暂无销售记录</div>
        <table v-else class="data-table">
          <thead><tr>
            <th>作品</th>
            <th>类型</th>
            <th>金额</th>
            <th>时间</th>
          </tr></thead>
          <tbody>
            <tr v-for="item in sales" :key="item.id">
              <td>{{ item.product_name }}</td>
              <td>{{ item.product_type === 'module' ? '模组' : '规则包' }}</td>
              <td>{{ centsToYuan(item.amount_cents) }}</td>
              <td>{{ new Date(item.created_at).toLocaleDateString('zh-CN') }}</td>
            </tr>
          </tbody>
        </table>
      </TCard>

      <!-- 提现记录 -->
      <TCard v-else-if="activeTab === 'history'" padding="lg">
        <h2 class="section-title">提现记录</h2>
        <div v-if="historyLoading" class="loading-hint">加载中…</div>
        <div v-else-if="withdrawals.length === 0" class="empty-hint">暂无提现记录</div>
        <table v-else class="data-table">
          <thead><tr>
            <th>金额</th>
            <th>渠道</th>
            <th>账号</th>
            <th>状态</th>
            <th>申请时间</th>
          </tr></thead>
          <tbody>
            <tr v-for="item in withdrawals" :key="item.id">
              <td>{{ centsToYuan(item.amount_cents) }}</td>
              <td>{{ { alipay: '支付宝', wechat: '微信', bank: '银行卡' }[item.channel] ?? item.channel }}</td>
              <td>{{ item.account_info }}</td>
              <td><TTag :color="withdrawalStatusColor(item.status)">{{ withdrawalStatusLabel(item.status) }}</TTag></td>
              <td>{{ new Date(item.created_at).toLocaleDateString('zh-CN') }}</td>
            </tr>
          </tbody>
        </table>
      </TCard>

    </div>
  </PageLayout>
</template>

<style scoped>
.earnings-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: 860px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}

.overview-card { text-align: center; }

.card-label {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: var(--space-2);
}

.card-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.card-value.highlight { color: var(--color-success, #18a058); }

.tab-bar {
  display: flex;
  gap: 2px;
  background: var(--surface-base, #f0f0f0);
  border-radius: 8px;
  padding: 3px;
  width: fit-content;
}

.tab-btn {
  padding: 6px 18px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: background 0.12s, color 0.12s;
}

.tab-btn.active {
  background: var(--surface-card);
  color: var(--text-primary);
  font-weight: 600;
}

.section-title { font-size: 16px; font-weight: 600; margin: 0 0 var(--space-4); }

.withdraw-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 480px;
}

.form-row { display: flex; flex-direction: column; gap: var(--space-2); }
.form-label { font-size: 14px; color: var(--text-secondary); }

.form-input {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md, 6px);
  background: var(--surface-elevated);
  color: var(--text-primary);
  font-size: 14px;
}

.radio-group { display: flex; gap: var(--space-4); font-size: 14px; }
.form-actions { display: flex; align-items: center; gap: var(--space-3); }
.no-balance-hint { font-size: 13px; color: var(--text-tertiary); }
.withdraw-hint { margin-top: var(--space-4); font-size: 12px; color: var(--text-muted, var(--text-tertiary)); }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  padding: 6px 10px;
  text-align: left;
  font-weight: 500;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-default);
}
.data-table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-muted, var(--border-default));
}

.loading-hint, .empty-hint {
  padding: var(--space-6);
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}
</style>
