<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { ElInput, ElMessage, ElSkeleton } from 'element-plus';
import TButton from '../base/TButton.vue';
import { listFloors, likeFloor, unlikeFloor, deleteFloor as apiDeleteFloor, deleteComment as apiDeleteComment, likeComment, unlikeComment } from '../../api/recruitment';
import { api } from '../../utils/api';
import { useAuthStore } from '../../stores/auth-store';

interface FloorComment {
  id: string;
  reply_id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  like_count: number;
  deleted: boolean;
  created_at: string;
  author_nickname?: string;
  author_avatar?: string;
  is_liked_by_me?: boolean;
  parent_author_nickname?: string;
}

interface FloorReply {
  id: string;
  post_id: string;
  user_id: string;
  floor_number: number;
  content: string;
  like_count: number;
  reply_count: number;
  deleted: boolean;
  created_at: string;
  author_nickname?: string;
  author_avatar?: string;
  is_liked_by_me?: boolean;
  preview_comments: FloorComment[];
}

const props = defineProps<{
  postId: string;
  // 1 楼：帖子正文（由父组件传入）
  postTitle?: string;
  postContent?: string;
  postAuthorNickname?: string;
  postCreatedAt?: string;
}>();

const authStore = useAuthStore();

const floors = ref<FloorReply[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const loading = ref(false);
const loadingMore = ref(false);

// 展开楼中楼的楼层 ID 集合
const expandedFloors = ref(new Set<string>());
// 每楼已加载的楼中楼
const floorCommentsMap = ref(new Map<string, FloorComment[]>());
const floorCommentTotals = ref(new Map<string, number>());
const floorCommentPages = ref(new Map<string, number>());
const loadingCommentsMap = ref(new Set<string>());

// 底部输入框状态
const inputContent = ref('');
const replyingToFloor = ref<FloorReply | null>(null); // 正在回复的楼层（主楼层）
const replyingToComment = ref<FloorComment | null>(null); // 正在回复的楼中楼（@提及）
const submitting = ref(false);

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function avatarChar(nickname?: string, userId?: string) {
  return ((nickname ?? userId) ?? '?').slice(0, 1).toUpperCase();
}

async function loadFloors(reset = false) {
  if (reset) {
    page.value = 1;
    floors.value = [];
    total.value = 0;
  }
  if (loading.value || loadingMore.value) return;

  const isFirst = page.value === 1;
  if (isFirst) loading.value = true;
  else loadingMore.value = true;

  try {
    const data = await listFloors(props.postId, { page: page.value, pageSize }) as { floors: FloorReply[]; total: number };
    floors.value = isFirst ? (data?.floors ?? []) : [...floors.value, ...(data?.floors ?? [])];
    total.value = data?.total ?? 0;
  } catch (err: any) {
    ElMessage.error(err?.message ?? '加载失败');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadMoreFloors() {
  if (floors.value.length >= total.value) return;
  page.value += 1;
  await loadFloors();
}

// 展开/收起楼中楼
async function toggleFloorComments(floor: FloorReply) {
  if (expandedFloors.value.has(floor.id)) {
    expandedFloors.value.delete(floor.id);
    return;
  }
  expandedFloors.value.add(floor.id);
  if (!floorCommentsMap.value.has(floor.id)) {
    await loadFloorComments(floor.id, 1);
  }
}

async function loadFloorComments(replyId: string, pg: number) {
  loadingCommentsMap.value.add(replyId);
  try {
    const data = await api.get<{ comments: FloorComment[]; total: number }>(
      `/recruitment/${props.postId}/floors/${replyId}/comments?page=${pg}&pageSize=20`,
    );
    const existing = pg === 1 ? [] : (floorCommentsMap.value.get(replyId) ?? []);
    floorCommentsMap.value.set(replyId, [...existing, ...(data?.comments ?? [])]);
    floorCommentTotals.value.set(replyId, data?.total ?? 0);
    floorCommentPages.value.set(replyId, pg);
  } catch (err: any) {
    ElMessage.error(err?.message ?? '加载评论失败');
  } finally {
    loadingCommentsMap.value.delete(replyId);
  }
}

async function loadMoreFloorComments(replyId: string) {
  const currentPage = floorCommentPages.value.get(replyId) ?? 1;
  const total = floorCommentTotals.value.get(replyId) ?? 0;
  const loaded = floorCommentsMap.value.get(replyId)?.length ?? 0;
  if (loaded >= total) return;
  await loadFloorComments(replyId, currentPage + 1);
}

// 设置回复目标（主楼层回复）
function replyToFloor(floor: FloorReply) {
  replyingToFloor.value = floor;
  replyingToComment.value = null;
  inputContent.value = '';
  // 滚动到底部输入框
  setTimeout(() => {
    document.querySelector('.floor-input-area')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);
}

// 设置回复目标（楼中楼 @提及）
function replyToComment(floor: FloorReply, comment: FloorComment) {
  replyingToFloor.value = floor;
  replyingToComment.value = comment;
  inputContent.value = `@${comment.author_nickname ?? comment.user_id} `;
  setTimeout(() => {
    document.querySelector('.floor-input-area')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);
}

function cancelReply() {
  replyingToFloor.value = null;
  replyingToComment.value = null;
  inputContent.value = '';
}

async function submitFloor() {
  const content = inputContent.value.trim();
  if (!content) {
    ElMessage.warning('请输入内容');
    return;
  }
  submitting.value = true;
  try {
    if (replyingToFloor.value) {
      // 发楼中楼
      const newComment = await api.post<FloorComment>(
        `/recruitment/${props.postId}/floors/${replyingToFloor.value.id}/comments`,
        {
          content,
          parent_comment_id: replyingToComment.value?.id ?? null,
        },
      );
      if (newComment) {
        // 追加到该楼的评论列表
        const existing = floorCommentsMap.value.get(replyingToFloor.value.id) ?? [];
        floorCommentsMap.value.set(replyingToFloor.value.id, [...existing, newComment]);
        // 更新楼层的 reply_count
        const floorIdx = floors.value.findIndex((f) => f.id === replyingToFloor.value!.id);
        if (floorIdx !== -1) {
          floors.value[floorIdx] = {
            ...floors.value[floorIdx],
            reply_count: floors.value[floorIdx].reply_count + 1,
          };
        }
        // 展开该楼
        expandedFloors.value.add(replyingToFloor.value.id);
      }
    } else {
      // 发主楼层
      const newFloor = await api.post<FloorReply>(
        `/recruitment/${props.postId}/floors`,
        { content },
      );
      if (newFloor) {
        floors.value = [...floors.value, { ...newFloor, preview_comments: [] }];
        total.value += 1;
      }
    }
    cancelReply();
    ElMessage.success('发送成功');
  } catch (err: any) {
    ElMessage.error(err?.message ?? '发送失败');
  } finally {
    submitting.value = false;
  }
}

async function toggleFloorLike(floor: FloorReply) {
  if (!authStore.token) { ElMessage.warning('请先登录'); return; }
  const idx = floors.value.findIndex((f) => f.id === floor.id);
  if (idx === -1) return;
  const liked = floors.value[idx].is_liked_by_me;
  // 乐观更新
  floors.value[idx] = {
    ...floors.value[idx],
    is_liked_by_me: !liked,
    like_count: liked ? floors.value[idx].like_count - 1 : floors.value[idx].like_count + 1,
  };
  try {
    if (liked) {
      await unlikeFloor(props.postId, floor.id);
    } else {
      await likeFloor(props.postId, floor.id);
    }
  } catch (err: any) {
    // 回滚乐观更新
    floors.value[idx] = {
      ...floors.value[idx],
      is_liked_by_me: liked,
      like_count: liked ? floors.value[idx].like_count + 1 : floors.value[idx].like_count - 1,
    };
    ElMessage.error(err?.message ?? '操作失败');
  }
}

async function toggleCommentLike(floor: FloorReply, comment: FloorComment) {
  if (!authStore.token) { ElMessage.warning('请先登录'); return; }
  const comments = floorCommentsMap.value.get(floor.id) ?? [];
  const idx = comments.findIndex((c) => c.id === comment.id);
  if (idx === -1) return;
  const liked = comments[idx].is_liked_by_me;
  comments[idx] = {
    ...comments[idx],
    is_liked_by_me: !liked,
    like_count: liked ? comments[idx].like_count - 1 : comments[idx].like_count + 1,
  };
  floorCommentsMap.value.set(floor.id, [...comments]);
  try {
    if (liked) {
      await unlikeComment(props.postId, floor.id, comment.id);
    } else {
      await likeComment(props.postId, floor.id, comment.id);
    }
  } catch (err: any) {
    comments[idx] = { ...comments[idx], is_liked_by_me: liked, like_count: liked ? comments[idx].like_count + 1 : comments[idx].like_count - 1 };
    floorCommentsMap.value.set(floor.id, [...comments]);
    ElMessage.error(err?.message ?? '操作失败');
  }
}

async function deleteFloor(floor: FloorReply) {
  try {
    await apiDeleteFloor(props.postId, floor.id);
    const idx = floors.value.findIndex((f) => f.id === floor.id);
    if (idx !== -1) {
      floors.value[idx] = { ...floors.value[idx], deleted: true, content: '[该楼层已删除]' };
    }
    ElMessage.success('已删除');
  } catch (err: any) {
    ElMessage.error(err?.message ?? '删除失败');
  }
}

async function deleteComment(floor: FloorReply, comment: FloorComment) {
  try {
    await apiDeleteComment(props.postId, floor.id, comment.id);
    const comments = floorCommentsMap.value.get(floor.id) ?? [];
    floorCommentsMap.value.set(floor.id, comments.filter((c) => c.id !== comment.id));
    // 更新楼层 reply_count
    const floorIdx = floors.value.findIndex((f) => f.id === floor.id);
    if (floorIdx !== -1 && floors.value[floorIdx].reply_count > 0) {
      floors.value[floorIdx] = { ...floors.value[floorIdx], reply_count: floors.value[floorIdx].reply_count - 1 };
    }
    ElMessage.success('已删除');
  } catch (err: any) {
    ElMessage.error(err?.message ?? '删除失败');
  }
}

watch(() => props.postId, () => loadFloors(true), { immediate: true });

// ─── 移动端键盘弹起适配 ──────────────────────────────────────────────────────
// 当软键盘弹出时，通过 visualViewport 调整固定底部输入框的 bottom 偏移
const inputAreaRef = ref<HTMLElement | null>(null);

function handleViewportResize() {
  if (!inputAreaRef.value) return;
  // 仅在移动端（屏幕宽度 ≤ 768px）启用
  if (window.innerWidth > 768) {
    inputAreaRef.value.style.bottom = '';
    return;
  }
  const vv = window.visualViewport;
  if (!vv) return;
  // visualViewport.offsetTop 表示键盘占用的高度
  const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
  inputAreaRef.value.style.bottom = keyboardHeight > 0 ? `${keyboardHeight}px` : '';
}

onMounted(() => {
  window.visualViewport?.addEventListener('resize', handleViewportResize);
  window.visualViewport?.addEventListener('scroll', handleViewportResize);
});

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', handleViewportResize);
  window.visualViewport?.removeEventListener('scroll', handleViewportResize);
});
</script>

<template>
  <div class="floor-system">
    <!-- 1 楼：帖子正文（固定） -->
    <div class="floor-item floor-item--first">
      <div class="floor-header">
        <div class="floor-author">
          <span class="floor-avatar">{{ avatarChar(postAuthorNickname) }}</span>
          <strong>{{ postAuthorNickname || '帖子作者' }}</strong>
          <span class="floor-label">1楼</span>
        </div>
        <span class="floor-time">{{ postCreatedAt ? formatDate(postCreatedAt) : '' }}</span>
      </div>
      <div class="floor-content">{{ postContent || '（帖子正文）' }}</div>
    </div>

    <!-- 主楼层列表 -->
    <ElSkeleton v-if="loading" :rows="3" animated class="floor-skeleton" />

    <template v-else>
      <div
        v-for="floor in floors"
        :key="floor.id"
        class="floor-item"
        :class="{ 'floor-item--deleted': floor.deleted }"
      >
        <div class="floor-header">
          <div class="floor-author">
            <span class="floor-avatar">{{ avatarChar(floor.author_nickname, floor.user_id) }}</span>
            <strong>{{ floor.author_nickname || floor.user_id }}</strong>
            <span class="floor-label">{{ floor.floor_number }}楼</span>
          </div>
          <div class="floor-actions">
            <span class="floor-time">{{ formatDate(floor.created_at) }}</span>
            <button
              v-if="!floor.deleted"
              class="action-btn"
              :class="{ 'action-btn--liked': floor.is_liked_by_me }"
              @click="toggleFloorLike(floor)"
            >
              ♥ {{ floor.like_count }}
            </button>
            <button
              v-if="!floor.deleted && authStore.token"
              class="action-btn"
              @click="replyToFloor(floor)"
            >
              回复
            </button>
            <button
              v-if="!floor.deleted && floor.user_id === authStore.userId"
              class="action-btn action-btn--danger"
              @click="deleteFloor(floor)"
            >
              删除
            </button>
          </div>
        </div>

        <div class="floor-content">{{ floor.content }}</div>

        <!-- 楼中楼区域 -->
        <div v-if="floor.reply_count > 0" class="nested-area">
          <!-- 预览（折叠时） -->
          <template v-if="!expandedFloors.has(floor.id)">
            <div
              v-for="c in floor.preview_comments"
              :key="c.id"
              class="nested-comment nested-comment--preview"
            >
              <span class="nested-author">{{ c.author_nickname || c.user_id }}</span>
              <template v-if="c.parent_author_nickname">
                <span class="nested-reply-to"> 回复 {{ c.parent_author_nickname }}：</span>
              </template>
              <span class="nested-content">{{ c.content }}</span>
            </div>
            <button class="expand-btn" @click="toggleFloorComments(floor)">
              展开全部 {{ floor.reply_count }} 条回复 ▼
            </button>
          </template>

          <!-- 展开后的完整楼中楼 -->
          <template v-else>
            <div
              v-if="loadingCommentsMap.has(floor.id)"
              class="nested-loading"
            >加载中…</div>
            <template v-else>
              <div
                v-for="c in floorCommentsMap.get(floor.id) ?? []"
                :key="c.id"
                class="nested-comment"
                :class="{ 'nested-comment--deleted': c.deleted }"
              >
                <div class="nested-comment-row">
                  <span class="nested-author">{{ c.author_nickname || c.user_id }}</span>
                  <template v-if="c.parent_author_nickname && !c.deleted">
                    <span class="nested-reply-to"> 回复 {{ c.parent_author_nickname }}：</span>
                  </template>
                  <span class="nested-content">{{ c.content }}</span>
                </div>
                <div class="nested-meta">
                  <span class="floor-time">{{ formatDate(c.created_at) }}</span>
                  <button
                    v-if="!c.deleted"
                    class="action-btn"
                    :class="{ 'action-btn--liked': c.is_liked_by_me }"
                    @click="toggleCommentLike(floor, c)"
                  >♥ {{ c.like_count }}</button>
                  <button
                    v-if="!c.deleted && authStore.token"
                    class="action-btn"
                    @click="replyToComment(floor, c)"
                  >回复</button>
                  <button
                    v-if="!c.deleted && c.user_id === authStore.userId"
                    class="action-btn action-btn--danger"
                    @click="deleteComment(floor, c)"
                  >删除</button>
                </div>
              </div>

              <!-- 加载更多楼中楼 -->
              <button
                v-if="(floorCommentsMap.get(floor.id)?.length ?? 0) < (floorCommentTotals.get(floor.id) ?? 0)"
                class="expand-btn"
                @click="loadMoreFloorComments(floor.id)"
              >
                加载更多评论
              </button>

              <button class="expand-btn" @click="expandedFloors.delete(floor.id)">
                收起 ▲
              </button>
            </template>
          </template>
        </div>
        <div v-else-if="!floor.deleted" class="no-comment-hint">
          暂无回复
          <button v-if="authStore.token" class="action-btn" @click="replyToFloor(floor)">抢沙发</button>
        </div>
      </div>

      <!-- 加载更多主楼层 -->
      <div v-if="floors.length < total" class="load-more-area">
        <TButton type="secondary" :loading="loadingMore" @click="loadMoreFloors">加载更多（{{ floors.length }}/{{ total }}）</TButton>
      </div>

      <div v-if="total === 0 && !loading" class="empty-floors">暂无回复，快来发第 2 楼吧</div>
    </template>

    <!-- 底部固定输入框 -->
    <div v-if="authStore.token" ref="inputAreaRef" class="floor-input-area">
      <div v-if="replyingToFloor" class="reply-target">
        <span>
          回复
          <strong>{{ replyingToFloor.floor_number }}楼</strong>
          <template v-if="replyingToComment">
            · @{{ replyingToComment.author_nickname || replyingToComment.user_id }}
          </template>
        </span>
        <button class="cancel-reply-btn" @click="cancelReply">×</button>
      </div>
      <div class="input-row">
        <ElInput
          v-model="inputContent"
          type="textarea"
          :rows="2"
          :maxlength="replyingToFloor ? 1000 : 2000"
          show-word-limit
          :placeholder="replyingToFloor ? '写下你的回复…' : '写下你的楼层回复…（回复帖子正文）'"
          resize="none"
        />
        <TButton type="primary" :loading="submitting" @click="submitFloor">发送</TButton>
      </div>
    </div>
    <div v-else class="login-hint">
      <span>登录后可参与讨论</span>
    </div>
  </div>
</template>

<style scoped>
.floor-system {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.floor-item {
  padding: var(--space-3);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
}

.floor-item--first {
  border-color: color-mix(in srgb, var(--color-primary, #5B8DB8) 30%, var(--color-card-border));
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 4%, var(--color-bg-card));
}

.floor-item--deleted {
  opacity: 0.6;
  background: var(--color-bg-secondary);
}

.floor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
  flex-wrap: wrap;
  gap: var(--space-1);
}

.floor-author {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.floor-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 12%, transparent);
  color: var(--color-text-primary);
  font-size: var(--text-xs);
  font-weight: 700;
  flex-shrink: 0;
}

.floor-label {
  font-size: var(--text-xs);
  color: var(--color-primary, #5B8DB8);
  padding: 0 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 10%, transparent);
}

.floor-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.floor-time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: color var(--transition-fast), background var(--transition-fast);
}

.action-btn:hover {
  color: var(--color-primary, #5B8DB8);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 10%, transparent);
}

.action-btn--liked {
  color: var(--color-danger);
}

.action-btn--danger:hover {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
}

.floor-content {
  white-space: pre-wrap;
  line-height: 1.7;
  word-break: break-word;
}

/* 楼中楼 */
.nested-area {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-left: 3px solid var(--color-card-border);
  background: var(--color-bg-secondary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.nested-comment {
  padding: var(--space-1) 0;
  border-bottom: 1px dashed var(--color-card-border);
}

.nested-comment:last-child {
  border-bottom: none;
}

.nested-comment--deleted {
  opacity: 0.5;
}

.nested-comment-row {
  font-size: var(--text-sm);
  line-height: 1.6;
  word-break: break-word;
}

.nested-comment--preview .nested-comment-row,
.nested-comment--preview {
  font-size: var(--text-sm);
}

.nested-author {
  font-weight: 600;
  color: var(--color-text-primary);
  margin-right: 4px;
}

.nested-reply-to {
  color: var(--color-text-muted);
  font-size: var(--text-xs);
}

.nested-content {
  color: var(--color-text-secondary);
}

.nested-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: 2px;
}

.nested-loading {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  padding: var(--space-2) 0;
}

.expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--color-primary, #5B8DB8);
  padding: var(--space-1) 0;
  text-align: left;
}

.expand-btn:hover {
  text-decoration: underline;
}

.no-comment-hint {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.empty-floors {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-4) 0;
}

.load-more-area {
  display: flex;
  justify-content: center;
  padding: var(--space-2) 0;
}

.floor-skeleton {
  padding: var(--space-3);
}

/* 底部输入框 */
.floor-input-area {
  position: sticky;
  bottom: 0;
  background: var(--color-bg-card);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  z-index: 10;
}

.reply-target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-bottom: var(--space-2);
  padding: var(--space-1) var(--space-2);
  background: color-mix(in srgb, var(--color-primary, #5B8DB8) 8%, var(--color-bg-secondary));
  border-radius: var(--radius-sm);
}

.cancel-reply-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-base);
  color: var(--color-text-muted);
  line-height: 1;
}

.input-row {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
}

.input-row :deep(.el-textarea) {
  flex: 1;
}

.login-hint {
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  padding: var(--space-3);
  border: 1px dashed var(--color-card-border);
  border-radius: var(--radius-md);
}

@media (max-width: 768px) {
  .floor-actions {
    gap: var(--space-1);
  }

  .floor-input-area {
    border-radius: 0;
    border-left: none;
    border-right: none;
    border-bottom: none;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .floor-system {
    padding-bottom: 120px; /* 为固定输入框留出空间 */
  }
}
</style>
