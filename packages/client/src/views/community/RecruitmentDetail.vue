<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ElMessage,
  ElDialog,
  ElInput,
  ElSelect,
  ElOption,
  ElDivider,
} from 'element-plus';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';
import FloorSystem from '../../components/community/FloorSystem.vue';
import { api } from '../../utils/api';
import { useAuthStore } from '../../stores/auth-store';
import { formatRecruitmentValue, hasRecruitmentValue, resolveRecruitmentFields } from '../../utils/recruitment-fields';

interface CharacterItem {
  id: string;
  name: string;
  ruleset_id: string;
  background?: string;
}

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const detail = ref<any>(null);
const myCharacters = ref<CharacterItem[]>([]);

const showApplyDialog = ref(false);
const applyCharacterId = ref('');
const applyMessage = ref('');

const showGroupDialog = ref(false);

// 拒绝申请对话框
const showRejectDialog = ref(false);
const rejectTargetId = ref('');
const rejectReason = ref('');

const postId = computed(() => String(route.params.id || ''));
const isOwner = computed(() => !!detail.value && detail.value.poster_id === authStore.userId);

const recruitmentFields = computed(() =>
  resolveRecruitmentFields(detail.value ? { id: detail.value.ruleset_id, name: detail.value.ruleset_name } : null)
);
const detailMetadataEntries = computed(() => {
  const metadata = (detail.value?.metadata ?? {}) as Record<string, unknown>;
  return recruitmentFields.value
    .map((field) => ({ label: field.label, value: metadata[field.name] }))
    .filter((item) => hasRecruitmentValue(item.value));
});
const filteredCharacters = computed(() => {
  if (!detail.value?.ruleset_id) return myCharacters.value;
  return myCharacters.value.filter((item) => item.ruleset_id === detail.value.ruleset_id);
});

/** 已确认入团的申请 */
const confirmedApplications = computed(() => {
  if (!Array.isArray(detail.value?.applications)) return [];
  return detail.value.applications.filter((item: any) => item.status === 'confirmed');
});

/** 成团条件：发帖者 + 状态为 open/full + 已确认人数 >= 要求人数 */
const canFormGroup = computed(() => {
  if (!isOwner.value || !detail.value) return false;
  if (!['open', 'full'].includes(detail.value.status)) return false;
  return confirmedApplications.value.length >= Number(detail.value.player_count_max || 0);
});

/** 玩家本人的申请 */
const myApplication = computed(() => detail.value?.my_application ?? null);

/** 是否可申请（帖子开放且当前用户无有效申请） */
const canApply = computed(() => {
  if (!authStore.token || isOwner.value) return false;
  if (!detail.value) return false;
  if (!['open', 'full'].includes(detail.value.status)) return false;
  const s = myApplication.value?.status;
  return !s || s === 'rejected';
});

/** 玩家是否可确认入团邀请 */
const canConfirm = computed(() => myApplication.value?.status === 'invited');

/** 邀请到期时间展示 */
function inviteDeadline(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return '';
  const diff = d.getTime() - Date.now();
  if (diff <= 0) return '已过期';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m 后截止`;
}

const statusMap: Record<string, { label: string; color: 'info' | 'warning' | 'danger' | 'default' }> = {
  draft:    { label: '草稿',   color: 'default' },
  open:     { label: '招募中', color: 'info' },
  full:     { label: '已满员', color: 'warning' },
  grouped:  { label: '已成团', color: 'danger' },
  closed:   { label: '已关闭', color: 'default' },
  dissolved:{ label: '已解散', color: 'default' },
  archived: { label: '已归档', color: 'default' },
};

const appStatusMap: Record<string, string> = {
  pending:   '审核中',
  invited:   '已邀请',
  confirmed: '已确认',
  waiting:   '候补中',
  rejected:  '已拒绝',
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

async function loadDetail() {
  loading.value = true;
  try {
    detail.value = await api.get(`/recruitment/${postId.value}`);
  } catch (err: any) {
    ElMessage.error(err?.message ?? '加载详情失败');
  } finally {
    loading.value = false;
  }
}

async function loadCharacters() {
  if (!authStore.token) return;
  try {
    myCharacters.value = await api.get<CharacterItem[]>('/characters');
  } catch {
    // ignore
  }
}

watch([detail, filteredCharacters], () => {
  if (applyCharacterId.value && !filteredCharacters.value.some((item) => item.id === applyCharacterId.value)) {
    applyCharacterId.value = '';
  }
});

async function submitApply() {
  if (!applyMessage.value.trim()) {
    ElMessage.warning('请填写申请留言');
    return;
  }
  try {
    // 满员时自动报名候补
    const suffix = detail.value?.status === 'full' ? '?type=waiting' : '';
    await api.post(`/recruitment/${postId.value}/apply${suffix}`, {
      character_id: applyCharacterId.value || null,
      message: applyMessage.value.trim(),
    });
    ElMessage.success(suffix ? '已加入候补名单' : '申请已提交');
    showApplyDialog.value = false;
    applyMessage.value = '';
    applyCharacterId.value = '';
    await loadDetail();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '申请失败');
  }
}

/** 玩家：确认入团邀请 */
async function confirmJoin() {
  try {
    await api.post(`/recruitment/applications/${myApplication.value.id}/confirm`, {});
    ElMessage.success('已确认入团！');
    await loadDetail();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '确认失败');
  }
}

/** GM：通过申请 → 发出邀请 */
async function approveApplication(applicationId: string) {
  try {
    await api.post(`/recruitment/${postId.value}/applications/${applicationId}/review`, { action: 'approve' });
    ElMessage.success('已发出邀请');
    await loadDetail();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '操作失败');
  }
}

/** GM：打开拒绝对话框 */
function openRejectDialog(applicationId: string) {
  rejectTargetId.value = applicationId;
  rejectReason.value = '';
  showRejectDialog.value = true;
}

/** GM：提交拒绝 */
async function submitReject() {
  try {
    await api.post(`/recruitment/${postId.value}/applications/${rejectTargetId.value}/review`, {
      action: 'reject',
      reject_reason: rejectReason.value.trim() || null,
    });
    ElMessage.success('已拒绝');
    showRejectDialog.value = false;
    await loadDetail();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '操作失败');
  }
}

/** GM：发布草稿 */
async function publishPost() {
  try {
    await api.post(`/recruitment/${postId.value}/publish`, {});
    ElMessage.success('已发布');
    await loadDetail();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '发布失败');
  }
}

/** GM：关闭招募 */
async function closePost() {
  try {
    await api.post(`/recruitment/${postId.value}/close`, {});
    ElMessage.success('已关闭');
    await loadDetail();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '关闭失败');
  }
}

/** GM：解散团队 */
async function dissolvePost() {
  try {
    await api.post(`/recruitment/${postId.value}/dissolve`, {});
    ElMessage.success('已解散');
    await loadDetail();
  } catch (err: any) {
    ElMessage.error(err?.message ?? '解散失败');
  }
}

/** GM：成团（使用所有 confirmed 申请） */
async function formGroup() {
  try {
    const result = await api.post<{ campaign_id: string }>(`/recruitment/${postId.value}/group`, {});
    ElMessage.success('成团成功');
    showGroupDialog.value = false;
    await loadDetail();
    if (result?.campaign_id) {
      router.push('/campaigns');
    }
  } catch (err: any) {
    ElMessage.error(err?.message ?? '成团失败');
  }
}

onMounted(async () => {
  await Promise.all([loadDetail(), loadCharacters()]);
});
</script>

<template>
  <div class="detail-page" v-loading="loading">
    <div class="detail-shell">
      <TButton type="secondary" class="back-btn" @click="router.push('/community')">返回社区</TButton>

      <TCard v-if="detail" padding="lg" class="main-card">
        <div class="head-row">
          <h1 class="title">{{ detail.title }}</h1>
          <TTag :color="statusMap[detail.status]?.color" size="sm">{{ statusMap[detail.status]?.label }}</TTag>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="info-label">发帖人</span>
            <span class="info-value">{{ detail.poster_nickname }}</span>
          </div>
          <div class="meta-item">
            <span class="info-label">规则包</span>
            <span class="info-value">{{ detail.ruleset_name || detail.ruleset_id }}</span>
          </div>
          <div class="meta-item">
            <span class="info-label">模组</span>
            <span class="info-value">{{ detail.module_name || '待定' }}</span>
          </div>
          <div class="meta-item">
            <span class="info-label">人数</span>
            <span class="info-value">{{ detail.player_count_joined }}/{{ detail.player_count_max }}</span>
          </div>
          <div class="meta-item">
            <span class="info-label">时间安排</span>
            <span class="info-value">{{ detail.schedule_text || '未填写' }}</span>
          </div>
          <div class="meta-item">
            <span class="info-label">发布时间</span>
            <span class="info-value">{{ formatDate(detail.created_at) }}</span>
          </div>
        </div>

        <div class="tag-row">
          <TTag v-for="tag in detail.tags || []" :key="tag" color="default" size="sm">{{ tag }}</TTag>
        </div>

        <div v-if="detailMetadataEntries.length" class="extra-grid">
          <div v-for="item in detailMetadataEntries" :key="item.label" class="extra-item">
            <span class="extra-label">{{ item.label }}</span>
            <strong class="extra-value">{{ formatRecruitmentValue(item.value) }}</strong>
          </div>
        </div>

        <!-- 玩家操作区 -->
        <div class="actions" v-if="!isOwner">
          <TButton v-if="canApply" type="primary" @click="showApplyDialog = true">
            {{ detail.status === 'full' ? '加入候补' : '申请加入' }}
          </TButton>
          <TButton v-if="canConfirm" type="primary" @click="confirmJoin">确认入团</TButton>
          <div v-if="myApplication" class="my-status-row">
            <TTag
              :color="myApplication.status === 'confirmed' ? 'success' : myApplication.status === 'rejected' ? 'danger' : myApplication.status === 'invited' ? 'info' : 'warning'"
              size="sm"
            >
              {{ appStatusMap[myApplication.status] ?? myApplication.status }}
            </TTag>
            <span v-if="myApplication.status === 'invited' && myApplication.invited_expires_at" class="expire-hint">
              {{ inviteDeadline(myApplication.invited_expires_at) }}
            </span>
            <span v-if="myApplication.status === 'waiting' && myApplication.waiting_position" class="expire-hint">
              候补第 {{ myApplication.waiting_position }} 位
            </span>
          </div>
        </div>

        <!-- GM 状态操作区 -->
        <div class="actions" v-if="isOwner">
          <TButton v-if="detail.status === 'draft'" type="primary" @click="publishPost">发布</TButton>
          <TButton v-if="['open', 'full'].includes(detail.status)" type="secondary" @click="closePost">关闭招募</TButton>
          <TButton v-if="detail.status === 'grouped'" type="secondary" @click="dissolvePost">解散团队</TButton>
          <TButton v-if="canFormGroup" type="primary" @click="showGroupDialog = true">成团</TButton>
        </div>
      </TCard>

      <TCard v-if="detail" padding="md" class="section-card">
        <h2 class="section-title">描述</h2>
        <pre class="markdown-text">{{ detail.description || '暂无描述' }}</pre>
      </TCard>

      <TCard v-if="detail && isOwner" padding="md" class="section-card">
        <div class="section-head">
          <h2 class="section-title">申请列表（仅发帖者可见）</h2>
        </div>

        <div v-if="!detail.applications || detail.applications.length === 0" class="empty">暂无申请</div>
        <div v-else class="application-list">
          <div v-for="app in detail.applications" :key="app.id" class="application-item">
            <div class="app-row">
              <div class="applicant-head">
                <span class="mini-avatar">{{ (app.applicant_nickname || app.applicant_user_id || '?').slice(0, 1) }}</span>
                <strong>{{ app.applicant_nickname || app.applicant_user_id }}</strong>
              </div>
              <span class="status" :class="app.status">{{ appStatusMap[app.status] ?? app.status }}</span>
            </div>
            <div class="app-row">角色卡：{{ app.character_name || '未选择' }}</div>
            <div class="app-row">摘要：{{ app.character_background || '暂无' }}</div>
            <div class="app-row">留言：{{ app.message }}</div>
            <div v-if="app.reject_reason" class="app-row reject-reason">拒绝原因：{{ app.reject_reason }}</div>
            <div v-if="app.status === 'invited' && app.invited_expires_at" class="app-row expire-hint">
              邀请截止：{{ inviteDeadline(app.invited_expires_at) }}
            </div>
            <div v-if="app.status === 'waiting'" class="app-row expire-hint">
              候补第 {{ app.waiting_position }} 位
            </div>
            <div class="app-actions" v-if="app.status === 'pending'">
              <TButton type="primary" size="sm" @click="approveApplication(app.id)">通过</TButton>
              <TButton type="secondary" size="sm" @click="openRejectDialog(app.id)">拒绝</TButton>
            </div>
          </div>
        </div>
      </TCard>

      <TCard v-if="detail" padding="md" class="section-card discussion-card">
        <h2 class="section-title">讨论区</h2>
        <FloorSystem
          :postId="postId"
          :postContent="detail.description || '（帖子描述）'"
          :postAuthorNickname="detail.poster_nickname"
          :postCreatedAt="detail.created_at"
        />
      </TCard>
    </div>

    <!-- 申请对话框 -->
    <ElDialog v-model="showApplyDialog" :title="detail?.status === 'full' ? '加入候补名单' : '申请加入'" width="520px">
      <div class="apply-hint">仅显示与当前招募规则集一致的角色卡。</div>
      <ElSelect v-model="applyCharacterId" placeholder="选择角色卡（可选）" clearable style="width:100%;margin-bottom:12px">
        <ElOption v-for="ch in filteredCharacters" :key="ch.id" :label="`${ch.name} (${ch.ruleset_id})`" :value="ch.id" />
      </ElSelect>
      <ElInput v-model="applyMessage" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="填写申请留言" />
      <template #footer>
        <TButton type="secondary" @click="showApplyDialog = false">取消</TButton>
        <TButton type="primary" @click="submitApply">提交</TButton>
      </template>
    </ElDialog>

    <!-- 成团确认对话框 -->
    <ElDialog v-model="showGroupDialog" title="确认成团" width="480px">
      <p>将以下 <strong>{{ confirmedApplications.length }}</strong> 名已确认玩家成团：</p>
      <div class="group-member-list">
        <div v-for="app in confirmedApplications" :key="app.id" class="group-member">
          {{ app.applicant_nickname || app.applicant_user_id }} — {{ app.character_name || '未选择角色卡' }}
        </div>
      </div>
      <template #footer>
        <TButton type="secondary" @click="showGroupDialog = false">取消</TButton>
        <TButton type="primary" @click="formGroup">确认成团</TButton>
      </template>
    </ElDialog>

    <!-- 拒绝原因对话框 -->
    <ElDialog v-model="showRejectDialog" title="拒绝申请" width="420px">
      <ElInput v-model="rejectReason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="拒绝原因（可选）" />
      <template #footer>
        <TButton type="secondary" @click="showRejectDialog = false">取消</TButton>
        <TButton type="danger" @click="submitReject">确认拒绝</TButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 100%;
  background: var(--surface-page);
  padding: var(--space-6) var(--space-4);
}
.detail-shell {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.back-btn { align-self: flex-start; }
.main-card, .section-card { width: 100%; }
.head-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}
.meta-grid {
  margin-top: var(--space-3);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--surface-hover);
}
.info-label { color: var(--text-muted); font-size: 13px; }
.info-value { color: var(--text-body); font-size: var(--text-sm); font-weight: var(--font-medium); }
.tag-row { margin-top: var(--space-3); display: flex; gap: var(--space-2); flex-wrap: wrap; }
.extra-grid {
  margin-top: var(--space-3);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}
.extra-item {
  padding: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 8%, var(--surface-card));
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.extra-label { color: var(--text-muted); font-size: var(--text-xs); }
.extra-value { color: var(--text-body); font-weight: var(--font-semibold); }
.markdown-text {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.7;
  color: var(--text-body);
  background: var(--surface-hover);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}
.actions {
  margin-top: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--surface-hover);
  border: 1px solid var(--border-default);
  flex-wrap: wrap;
}
.my-status-row { display: flex; align-items: center; gap: var(--space-2); }
.expire-hint { color: var(--text-muted); font-size: var(--text-xs); }
.reject-reason { color: var(--color-danger); font-size: var(--text-sm); }
.section-head { display: flex; align-items: center; justify-content: space-between; }
.section-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
}
.application-list { display: flex; flex-direction: column; gap: var(--space-3); }
.application-item {
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-hover);
}
.applicant-head { display: flex; align-items: center; gap: var(--space-2); }
.mini-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 14%, transparent);
  color: var(--text-primary);
  font-size: var(--text-xs);
  font-weight: 700;
}
.app-row { margin-bottom: 4px; color: var(--text-body); }
.status.pending  { color: var(--color-warning, #d97706); }
.status.invited  { color: var(--color-info, #2563eb); }
.status.confirmed{ color: var(--color-success, #16a34a); }
.status.waiting  { color: var(--text-muted); }
.status.rejected { color: var(--color-danger, #dc2626); }
.app-actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
.empty { color: var(--text-muted); padding: var(--space-3) 0; }
.group-member-list { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
.group-member { padding: var(--space-2) var(--space-3); border: 1px solid var(--border-default); border-radius: var(--radius-sm); }
.apply-hint { margin-bottom: var(--space-2); color: var(--text-muted); font-size: var(--text-sm); }
@media (max-width: 768px) {
  .detail-page { padding: var(--space-4) var(--space-3); }
  .meta-grid,
  .extra-grid { grid-template-columns: 1fr; }
}
</style>
