<script setup lang="ts">
/**
 * 结束团二次确认弹窗
 * 设计依据：附录 C § 5.13.1
 */
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { endCampaign } from '../../api/campaigns';

const props = defineProps<{
  modelValue: boolean;
  campaignId: string;
  campaignName: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  ended: [];
}>();

const loading = ref(false);

function close() {
  if (loading.value) return;
  emit('update:modelValue', false);
}

async function confirm() {
  loading.value = true;
  try {
    await endCampaign(props.campaignId);
    ElMessage.success('团已结束，反馈邀请已发送给所有成员');
    emit('ended');
    close();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'Campaign already ended') {
      ElMessage.warning('该团已经是结束状态');
    } else {
      ElMessage.error('操作失败，请稍后再试');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="ecd-overlay" @click.self="close">
      <div class="ecd-modal" role="dialog" aria-label="结束团确认">
        <header class="ecd-header">
          <span class="ecd-title">结束团</span>
        </header>

        <div class="ecd-body">
          <p class="ecd-question">确定要结束《{{ campaignName }}》吗？</p>
          <div class="ecd-effects">
            <p class="ecd-effects-label">结束后：</p>
            <ul class="ecd-effects-list">
              <li>所有成员将收到跑团反馈邀请</li>
              <li>房间变为只读，不可再发言</li>
              <li>可在「已结束」列表中查看和导出日志</li>
            </ul>
          </div>
          <p class="ecd-warning">⚠️ 此操作不可撤销</p>
        </div>

        <footer class="ecd-footer">
          <button class="ecd-btn ecd-btn--cancel" :disabled="loading" @click="close">取消</button>
          <button class="ecd-btn ecd-btn--confirm" :disabled="loading" @click="confirm">
            {{ loading ? '处理中…' : '确认结束团' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ecd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.ecd-modal {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg, 0 16px 48px rgba(0,0,0,.24));
  width: 100%;
  max-width: 400px;
}

.ecd-header {
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-default);
}

.ecd-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.ecd-body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ecd-question {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
}

.ecd-effects {
  background: var(--surface-hover, rgba(0,0,0,.04));
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.ecd-effects-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-2);
}

.ecd-effects-list {
  margin: 0;
  padding-left: var(--space-4);
  font-size: 13px;
  color: var(--color-text-secondary);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ecd-warning {
  font-size: 13px;
  color: var(--color-warning, #f59e0b);
  margin: 0;
  font-weight: 500;
}

.ecd-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border-default);
}

.ecd-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all .15s;
}
.ecd-btn:disabled { opacity: .5; cursor: not-allowed; }

.ecd-btn--cancel {
  background: transparent;
  color: var(--color-text-secondary);
  border-color: var(--border-default);
}
.ecd-btn--cancel:not(:disabled):hover { background: var(--surface-hover); }

.ecd-btn--confirm {
  background: var(--color-danger, #ef4444);
  color: #fff;
  border-color: var(--color-danger, #ef4444);
}
.ecd-btn--confirm:not(:disabled):hover { opacity: .88; }
</style>
