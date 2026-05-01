<script setup lang="ts">
/**
 * Stars and Wishes 反馈弹窗
 * 设计依据：附录 C § 5.13.2 / 附录 B § 4.1
 *
 * 触发场景：
 *   1. WebSocket campaign_ended 事件（在线即时弹出）
 *   2. MyCampaigns 已结束列表点击「补填反馈」
 *   3. 站内通知跳转
 */
import { ref, watch, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { submitFeedback, getMyFeedback, deleteMyFeedback } from '../../api/campaigns';
import type { CampaignFeedback } from '../../api/campaigns';

const props = defineProps<{
  /** 是否显示 */
  modelValue: boolean;
  campaignId: string;
  campaignName: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  /** 成功提交后通知父组件 */
  submitted: [feedback: CampaignFeedback];
}>();

const star = ref('');
const wish = ref('');
const submitting = ref(false);
const loading = ref(false);
/** 是否已有历史反馈（补填模式） */
const existing = ref<CampaignFeedback | null>(null);
const isEditing = ref(false);

async function loadExisting() {
  loading.value = true;
  try {
    const res = await getMyFeedback(props.campaignId);
    if (res.data && !res.data.is_deleted) {
      existing.value = res.data;
      star.value = res.data.star ?? '';
      wish.value = res.data.wish ?? '';
      isEditing.value = true;
    } else {
      existing.value = null;
      isEditing.value = false;
    }
  } catch {
    // 初次打开无反馈时静默处理
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) loadExisting();
  },
  { immediate: true },
);

function close() {
  emit('update:modelValue', false);
}

async function submit() {
  submitting.value = true;
  try {
    const feedback = await submitFeedback(props.campaignId, {
      star: star.value.trim() || null,
      wish: wish.value.trim() || null,
    });
    existing.value = feedback;
    isEditing.value = true;
    ElMessage.success('反馈已提交');
    emit('submitted', feedback);
    close();
  } catch {
    ElMessage.error('提交失败，请稍后重试');
  } finally {
    submitting.value = false;
  }
}

async function deleteFeedback() {
  try {
    await deleteMyFeedback(props.campaignId);
    existing.value = null;
    star.value = '';
    wish.value = '';
    isEditing.value = false;
    ElMessage.success('反馈已删除');
    close();
  } catch {
    ElMessage.error('删除失败');
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="sw-overlay" @click.self="close">
      <div class="sw-modal" role="dialog" :aria-label="`跑团反馈：${campaignName}`">
        <!-- 标题 -->
        <header class="sw-header">
          <span class="sw-title">跑团反馈：《{{ campaignName }}》</span>
          <button class="sw-close" @click="close" aria-label="关闭">✕</button>
        </header>

        <div v-if="loading" class="sw-loading">加载中…</div>

        <div v-else class="sw-body">
          <p class="sw-intro">这个团结束了！想对 GM 和队友说点什么吗？</p>

          <!-- Star -->
          <div class="sw-field">
            <label class="sw-label">⭐ Star（星星）</label>
            <p class="sw-hint">这次跑团中让你印象深刻的瞬间？</p>
            <textarea
              v-model="star"
              class="sw-textarea"
              placeholder="（选填，500 字以内）"
              maxlength="500"
              rows="3"
            />
            <span class="sw-count">{{ star.length }}/500</span>
          </div>

          <!-- Wish -->
          <div class="sw-field">
            <label class="sw-label">💫 Wish（愿望）</label>
            <p class="sw-hint">下次跑团你希望看到什么？</p>
            <textarea
              v-model="wish"
              class="sw-textarea"
              placeholder="（选填，500 字以内）"
              maxlength="500"
              rows="3"
            />
            <span class="sw-count">{{ wish.length }}/500</span>
          </div>

          <p v-if="isEditing" class="sw-edited-tip">已提交反馈，可修改后重新提交，或删除。</p>
        </div>

        <footer class="sw-footer">
          <button v-if="isEditing" class="sw-btn sw-btn--danger" @click="deleteFeedback">删除</button>
          <span class="sw-spacer" />
          <button class="sw-btn sw-btn--ghost" @click="close">跳过</button>
          <button
            class="sw-btn sw-btn--primary"
            :disabled="submitting"
            @click="submit"
          >{{ submitting ? '提交中…' : '提交' }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sw-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.sw-modal {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg, 0 16px 48px rgba(0,0,0,.24));
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-default);
}

.sw-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sw-close {
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  line-height: 1;
  transition: color .15s;
}
.sw-close:hover { color: var(--color-text-primary); }

.sw-loading {
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.sw-body {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sw-intro {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.sw-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sw-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.sw-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
}

.sw-textarea {
  resize: vertical;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  font-size: 14px;
  color: var(--color-text-primary);
  background: var(--surface-input, var(--surface-card));
  transition: border-color .15s;
  line-height: 1.6;
}
.sw-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.sw-count {
  font-size: 11px;
  color: var(--color-text-tertiary);
  text-align: right;
}

.sw-edited-tip {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-hover, rgba(0,0,0,.04));
  border-radius: var(--radius-md);
}

.sw-footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border-default);
}

.sw-spacer { flex: 1; }

.sw-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all .15s;
}
.sw-btn:disabled { opacity: .5; cursor: not-allowed; }

.sw-btn--primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.sw-btn--primary:not(:disabled):hover { opacity: .88; }

.sw-btn--ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border-color: var(--border-default);
}
.sw-btn--ghost:hover { background: var(--surface-hover); }

.sw-btn--danger {
  background: transparent;
  color: var(--color-danger, #ef4444);
  border-color: var(--color-danger, #ef4444);
}
.sw-btn--danger:hover {
  background: var(--color-danger, #ef4444);
  color: #fff;
}
</style>
