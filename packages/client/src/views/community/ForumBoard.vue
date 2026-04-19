<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElDialog, ElForm, ElFormItem, ElInput, ElButton as ElBtn } from 'element-plus';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../utils/api';

interface Thread {
  id: string;
  is_pinned?: boolean;
  is_locked?: boolean;
  title: string;
  author_nickname?: string;
  reply_count: number;
  view_count: number;
  last_reply_at: string | null;
  created_at: string;
}

const BOARD_LABELS: Record<string, string> = {
  rules:      '规则问答',
  creation:   '模组创作',
  experience: '游玩体验',
  newbie:     '新人求助',
  lounge:     '水区',
};

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const board = computed(() => route.params['board'] as string);
const boardLabel = computed(() => BOARD_LABELS[board.value] ?? '讨论区');

const page = ref(1);
const pageSize = 20;
const sort = ref<'newest' | 'hottest' | 'latest_reply'>('latest_reply');
const threads = ref<Thread[]>([]);
const total = ref(0);
const loading = ref(false);

// 发帖弹窗
const showPostDialog = ref(false);
const newTitle = ref('');
const newContent = ref('');
const posting = ref(false);

async function fetchThreads() {
  loading.value = true;
  try {
    const params = new URLSearchParams({ sort: sort.value, page: String(page.value), limit: String(pageSize) });
    const body = await api.get<{ data: Thread[]; total: number }>(`/forum/boards/${board.value}/threads?${params}`);
    threads.value = body.data;
    total.value = body.total;
  } catch (error: any) {
    ElMessage.error(error?.message ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

async function submitPost() {
  if (!newTitle.value.trim() || !newContent.value.trim()) {
    ElMessage.warning('标题和内容不能为空');
    return;
  }
  posting.value = true;
  try {
    const thread = await api.post<Thread>('/forum/threads', {
      board: board.value,
      title: newTitle.value,
      content: newContent.value,
    });
    ElMessage.success('发帖成功');
    showPostDialog.value = false;
    newTitle.value = '';
    newContent.value = '';
    router.push(`/community/thread/${thread.id}`);
  } catch (e: any) {
    ElMessage.error(e?.message ?? '发帖失败');
  } finally {
    posting.value = false;
  }
}

function formatTime(iso: string | null) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return d.toLocaleDateString();
  } catch {
    return '-';
  }
}

function goThread(id: string) {
  router.push(`/community/thread/${id}`);
}

const totalPages = computed(() => Math.ceil(total.value / pageSize));

watch([board, sort], () => { page.value = 1; fetchThreads(); }, { immediate: false });
watch(page, fetchThreads);
onMounted(fetchThreads);
</script>

<template>
  <div class="forum-board">
    <div class="board-header">
      <h2 class="board-title">{{ boardLabel }}</h2>
      <div class="header-actions">
        <select v-model="sort" class="sort-select">
          <option value="latest_reply">最新回复</option>
          <option value="newest">最新发布</option>
          <option value="hottest">最热</option>
        </select>
        <TButton v-if="authStore.isLoggedIn" type="primary" size="sm" @click="showPostDialog = true">+ 发帖</TButton>
      </div>
    </div>

    <!-- 帖子列表 -->
    <div class="thread-table">
      <div class="thread-row thread-head">
        <span class="col-title">标题</span>
        <span class="col-author">作者</span>
        <span class="col-num">回复</span>
        <span class="col-num">浏览</span>
        <span class="col-last">最后回复</span>
      </div>

      <div
        v-for="t in threads"
        :key="t.id"
        class="thread-row thread-item"
        :class="{ pinned: t.is_pinned }"
        @click="goThread(t.id)"
      >
        <div class="col-title title-cell">
          <div class="title-tags">
            <TTag v-if="t.is_pinned" size="sm" color="warning">置顶</TTag>
            <TTag v-if="t.is_locked" size="sm" color="info">锁帖</TTag>
          </div>
          <span class="thread-title">{{ t.title }}</span>
        </div>

        <span class="col-author author-name">{{ t.author_nickname ?? '-' }}</span>
        <span class="col-num">{{ t.reply_count }}</span>
        <span class="col-num">{{ t.view_count }}</span>
        <div class="col-last last-cell">
          <span>{{ formatTime(t.last_reply_at) }}</span>
        </div>
      </div>

      <div v-if="!loading && threads.length === 0" class="empty-state">
        暂无帖子，来发布第一篇吧！
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pager">
      <button class="page-btn" :disabled="page <= 1" @click="page--">上一页</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="page++">下一页</button>
    </div>

    <!-- 发帖弹窗 -->
    <ElDialog v-model="showPostDialog" title="发布新帖" width="480px">
      <div class="post-form">
        <div class="form-item">
          <label class="form-label">标题</label>
          <ElInput v-model="newTitle" placeholder="帖子标题（2-200字）" maxlength="200" show-word-limit />
        </div>
        <div class="form-item">
          <label class="form-label">内容</label>
          <ElInput v-model="newContent" type="textarea" :rows="6" placeholder="帖子内容" maxlength="10000" show-word-limit />
        </div>
      </div>
      <template #footer>
        <ElBtn @click="showPostDialog = false">取消</ElBtn>
        <ElBtn type="primary" :loading="posting" @click="submitPost">发布</ElBtn>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.forum-board { display: flex; flex-direction: column; gap: var(--space-4); }

.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.board-title { font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--text-primary); }
.header-actions { display: flex; align-items: center; gap: var(--space-2); }
.sort-select {
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-base);
  color: var(--text-body);
  font-size: var(--text-sm);
  cursor: pointer;
}
.post-form { display: flex; flex-direction: column; gap: var(--space-3); }
.form-item { display: flex; flex-direction: column; gap: var(--space-1); }
.form-label { font-size: var(--text-sm); font-weight: var(--font-semibold); color: var(--text-body); }

/* 表格 */
.thread-table {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.thread-row {
  display: grid;
  grid-template-columns: 1fr 100px 60px 60px 140px;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  gap: var(--space-3);
  border-bottom: 1px solid var(--border-default);
}
.thread-row:last-child { border-bottom: none; }

.thread-head {
  background: var(--surface-hover);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
}

.thread-item {
  cursor: pointer;
  transition: background var(--transition-fast);
}
.thread-item:hover { background: var(--surface-hover); }
.thread-item.pinned { background: color-mix(in srgb, var(--color-warning-bg, #fef3c7) 30%, transparent); }

.title-cell { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.title-tags { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.thread-title {
  font-size: var(--text-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.author-name { font-size: var(--text-sm); color: var(--text-secondary); }

.col-num {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-align: center;
}

.last-cell {
  display: flex;
  flex-direction: column;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  gap: 2px;
}
.last-user { color: var(--text-muted); }

.empty-state {
  text-align: center;
  padding: var(--space-8);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}
.page-btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-body);
  font-size: var(--text-sm);
  cursor: pointer;
}
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-btn:not(:disabled):hover { background: var(--surface-hover); }
.page-info { font-size: var(--text-sm); color: var(--text-secondary); }

/* 响应式 */
@media (max-width: 640px) {
  .thread-row { grid-template-columns: 1fr 60px 50px; }
  .col-author, .col-last { display: none; }
}
</style>
