<script setup lang="ts">
/**
 * GM 查看跑团反馈面板
 * 入口：导演台 → 「记录」面板 → 「跑团反馈」tab
 * 设计依据：附录 C § 5.13.3
 */
import { ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import TSpinner from '../base/TSpinner.vue';
import { getCampaignFeedbackSummary, updateFeedbackVisibility } from '../../api/campaigns';
import type { FeedbackSummary, CampaignFeedback } from '../../api/campaigns';

const props = defineProps<{
  campaignId: string;
}>();

const loading = ref(false);
const summary = ref<FeedbackSummary>({ submitted: [], pending: [] });
const expandedId = ref<string | null>(null);
const updatingVisibility = ref(false);

/** 当前所有已提交反馈的可见性（取第一条为准；实际为全局统一） */
const currentVisibility = ref<'gm_only' | 'all_members'>('gm_only');

async function load() {
  loading.value = true;
  try {
    summary.value = await getCampaignFeedbackSummary(props.campaignId);
    if (summary.value.submitted.length > 0) {
      currentVisibility.value = summary.value.submitted[0].visibility;
    }
  } catch {
    ElMessage.error('加载反馈列表失败');
  } finally {
    loading.value = false;
  }
}

async function toggleVisibility() {
  const next = currentVisibility.value === 'gm_only' ? 'all_members' : 'gm_only';
  updatingVisibility.value = true;
  try {
    await updateFeedbackVisibility(props.campaignId, next);
    currentVisibility.value = next;
    // 同步更新本地列表
    summary.value.submitted.forEach((f) => (f.visibility = next));
    ElMessage.success(next === 'all_members' ? '已切换为「全团可见」' : '已切换为「仅 GM 可见」');
  } catch {
    ElMessage.error('更新失败');
  } finally {
    updatingVisibility.value = false;
  }
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function truncate(text: string | null, len = 50): string {
  if (!text) return '—';
  return text.length > len ? text.slice(0, len) + '…' : text;
}

onMounted(load);
watch(() => props.campaignId, load);
</script>

<template>
  <div class="gfp">
    <!-- 标题栏 + 可见性切换 -->
    <div class="gfp-header">
      <h3 class="gfp-title">跑团反馈</h3>
      <div class="gfp-actions">
        <button
          class="gfp-visibility-btn"
          :disabled="updatingVisibility || summary.submitted.length === 0"
          @click="toggleVisibility"
        >
          {{ currentVisibility === 'gm_only' ? '🔒 仅 GM 可见' : '👁 全团可见' }}
          <span class="gfp-toggle-hint">（点击切换）</span>
        </button>
        <button class="gfp-refresh-btn" @click="load" :disabled="loading">刷新</button>
      </div>
    </div>

    <TSpinner v-if="loading" />

    <template v-else>
      <!-- 已提交反馈列表 -->
      <section v-if="summary.submitted.length > 0" class="gfp-section">
        <div class="gfp-section-label">已提交（{{ summary.submitted.length }}）</div>
        <div class="gfp-table-wrap">
          <table class="gfp-table">
            <thead>
              <tr>
                <th>参与者</th>
                <th>⭐ Star</th>
                <th>💫 Wish</th>
                <th>提交时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="fb in summary.submitted" :key="fb.id">
                <tr class="gfp-row">
                  <td class="gfp-user-cell">
                    <img
                      v-if="fb.avatar_url"
                      :src="fb.avatar_url"
                      class="gfp-avatar"
                      :alt="fb.nickname"
                    />
                    <span v-else class="gfp-avatar-placeholder">{{ (fb.nickname ?? '?')[0] }}</span>
                    <span class="gfp-nickname">{{ fb.nickname ?? fb.user_id }}</span>
                  </td>
                  <td class="gfp-text-cell">{{ truncate(fb.star) }}</td>
                  <td class="gfp-text-cell">{{ truncate(fb.wish) }}</td>
                  <td class="gfp-time-cell">
                    {{ new Date(fb.submitted_at).toLocaleDateString('zh-CN') }}
                    <span v-if="fb.updated_at" class="gfp-edited">已编辑</span>
                  </td>
                  <td>
                    <button class="gfp-expand-btn" @click="toggleExpand(fb.id)">
                      {{ expandedId === fb.id ? '收起' : '查看' }}
                    </button>
                  </td>
                </tr>
                <!-- 展开详情行 -->
                <tr v-if="expandedId === fb.id" class="gfp-detail-row">
                  <td colspan="5">
                    <div class="gfp-detail">
                      <div v-if="fb.star" class="gfp-detail-block">
                        <span class="gfp-detail-label">⭐ Star</span>
                        <p class="gfp-detail-text">{{ fb.star }}</p>
                      </div>
                      <div v-if="fb.wish" class="gfp-detail-block">
                        <span class="gfp-detail-label">💫 Wish</span>
                        <p class="gfp-detail-text">{{ fb.wish }}</p>
                      </div>
                      <p v-if="!fb.star && !fb.wish" class="gfp-detail-empty">该成员已提交但未填写内容。</p>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 待反馈名单 -->
      <section v-if="summary.pending.length > 0" class="gfp-section">
        <div class="gfp-section-label">待反馈（{{ summary.pending.length }}）</div>
        <div class="gfp-pending-tip">以下成员尚未提交反馈，可私信或在群内提醒（平台不会自动催促）。</div>
        <ul class="gfp-pending-list">
          <li v-for="p in summary.pending" :key="p.user_id" class="gfp-pending-item">
            <img
              v-if="p.avatar_url"
              :src="p.avatar_url"
              class="gfp-avatar"
              :alt="p.nickname"
            />
            <span v-else class="gfp-avatar-placeholder">{{ p.nickname[0] }}</span>
            <span class="gfp-nickname">{{ p.nickname }}</span>
            <span class="gfp-tag-pending">未提交</span>
          </li>
        </ul>
      </section>

      <!-- 空状态 -->
      <div
        v-if="summary.submitted.length === 0 && summary.pending.length === 0"
        class="gfp-empty"
      >
        暂无成员数据
      </div>
    </template>
  </div>
</template>

<style scoped>
.gfp {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.gfp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.gfp-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.gfp-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.gfp-visibility-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}
.gfp-visibility-btn:not(:disabled):hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.gfp-visibility-btn:disabled { opacity: .5; cursor: not-allowed; }

.gfp-toggle-hint {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.gfp-refresh-btn {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}
.gfp-refresh-btn:not(:disabled):hover { background: var(--surface-hover); }
.gfp-refresh-btn:disabled { opacity: .5; cursor: not-allowed; }

.gfp-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.gfp-section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: .04em;
}

/* ── 表格 ── */
.gfp-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.gfp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: var(--color-text-primary);
}

.gfp-table thead th {
  background: var(--surface-hover, rgba(0,0,0,.04));
  padding: var(--space-2) var(--space-3);
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--border-default);
}

.gfp-table tbody tr {
  border-bottom: 1px solid var(--border-default);
}
.gfp-table tbody tr:last-child { border-bottom: none; }

.gfp-row td {
  padding: var(--space-2) var(--space-3);
  vertical-align: middle;
}

.gfp-user-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  white-space: nowrap;
}

.gfp-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.gfp-avatar-placeholder {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-primary-light, #dbeafe);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.gfp-nickname {
  font-weight: 500;
}

.gfp-text-cell {
  color: var(--color-text-secondary);
  max-width: 180px;
}

.gfp-time-cell {
  white-space: nowrap;
  color: var(--color-text-tertiary);
  font-size: 12px;
}

.gfp-edited {
  display: inline-block;
  margin-left: var(--space-1);
  font-size: 11px;
  color: var(--color-text-tertiary);
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
  padding: 0 var(--space-1);
}

.gfp-expand-btn {
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s;
}
.gfp-expand-btn:hover { background: var(--surface-hover); }

.gfp-detail-row td {
  padding: 0 var(--space-3) var(--space-3);
  background: var(--surface-hover, rgba(0,0,0,.02));
}

.gfp-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--surface-card);
}

.gfp-detail-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.gfp-detail-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.gfp-detail-text {
  font-size: 14px;
  color: var(--color-text-primary);
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.6;
}

.gfp-detail-empty {
  font-size: 13px;
  color: var(--color-text-tertiary);
  margin: 0;
}

/* ── 待反馈 ── */
.gfp-pending-tip {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.gfp-pending-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.gfp-pending-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-card);
}

.gfp-tag-pending {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-tertiary);
  background: var(--surface-hover);
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
}

.gfp-empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 14px;
}
</style>
