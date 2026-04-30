<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageLayout from '../../components/layout/PageLayout.vue';
import TCard from '../../components/base/TCard.vue';
import TButton from '../../components/base/TButton.vue';
import { getCreatorEarnings, applyWithdrawal, type EarningsSummary } from '../../api/creator';

const loading = ref(false);
const withdrawLoading = ref(false);
const earnings = ref<EarningsSummary | null>(null);

const withdrawAmount = ref<number>(0);
const withdrawAccount = ref('');
const withdrawAccountType = ref<'alipay' | 'bank'>('alipay');

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

  await ElMessageBox.confirm(
    `确认提现 ¥${withdrawAmount.value.toFixed(2)} 到 ${withdrawAccountType.value === 'alipay' ? '支付宝' : '银行卡'} ${withdrawAccount.value}？`,
    '申请提现',
    { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' }
  );

  withdrawLoading.value = true;
  try {
    await applyWithdrawal(withdrawAmount.value, {
      type: withdrawAccountType.value,
      account: withdrawAccount.value.trim(),
    });
    ElMessage.success('提现申请已提交，预计 3-5 个工作日到账');
    withdrawAmount.value = 0;
    withdrawAccount.value = '';
    await loadEarnings();
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '提现申请失败');
  } finally {
    withdrawLoading.value = false;
  }
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

      <!-- 提现申请 -->
      <TCard padding="lg" class="withdraw-card">
        <h2 class="section-title">申请提现</h2>
        <div class="withdraw-form">
          <div class="form-row">
            <label class="form-label">提现金额（元）</label>
            <input
              v-model.number="withdrawAmount"
              type="number"
              min="1"
              step="0.01"
              class="form-input"
              placeholder="最低提现 ¥10"
            />
          </div>
          <div class="form-row">
            <label class="form-label">收款方式</label>
            <div class="radio-group">
              <label>
                <input v-model="withdrawAccountType" type="radio" value="alipay" /> 支付宝
              </label>
              <label>
                <input v-model="withdrawAccountType" type="radio" value="bank" /> 银行卡
              </label>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">
              {{ withdrawAccountType === 'alipay' ? '支付宝账号' : '银行卡号' }}
            </label>
            <input
              v-model="withdrawAccount"
              type="text"
              class="form-input"
              :placeholder="withdrawAccountType === 'alipay' ? '请输入支付宝手机号或邮箱' : '请输入银行卡号'"
            />
          </div>
          <div class="form-actions">
            <TButton
              type="primary"
              :loading="withdrawLoading"
              :disabled="!earnings || earnings.available_balance <= 0"
              @click="submitWithdrawal"
            >
              申请提现
            </TButton>
            <span v-if="earnings && earnings.available_balance <= 0" class="no-balance-hint">
              暂无可提现余额
            </span>
          </div>
        </div>
        <p class="withdraw-hint">提现手续费：免费。预计到账：3-5 个工作日。最低提现金额：¥10。</p>
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

.overview-card {
  text-align: center;
}

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

.card-value.highlight {
  color: var(--color-success, #18a058);
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 var(--space-4);
}

.withdraw-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 480px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.form-input {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md, 6px);
  background: var(--surface-elevated);
  color: var(--text-primary);
  font-size: 14px;
}

.radio-group {
  display: flex;
  gap: var(--space-4);
  font-size: 14px;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.no-balance-hint {
  font-size: 13px;
  color: var(--text-tertiary);
}

.withdraw-hint {
  margin-top: var(--space-4);
  font-size: 12px;
  color: var(--text-muted, var(--text-tertiary));
}
</style>
