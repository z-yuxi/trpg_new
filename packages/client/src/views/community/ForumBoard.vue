<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';

interface Thread {
  id: string;
  pinned?: boolean;
  featured?: boolean;
  isNew?: boolean;
  title: string;
  author: string;
  replies: number;
  views: number;
  lastReplyAt: string;
  lastReplyUser: string;
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
const board = computed(() => route.params.board as string);
const boardLabel = computed(() => BOARD_LABELS[board.value] ?? '讨论区');

const page = ref(1);
const pageSize = 20;

// TODO: 后端 /api/forum/:board/threads 接口实现后替换此本地数据
const threads = ref<Thread[]>([
  {
    id: '1',
    pinned: true,
    featured: true,
    title: '【置顶】板块说明与规则',
    author: '管理员',
    replies: 5,
    views: 1024,
    lastReplyAt: new Date(Date.now() - 3600_000).toISOString(),
    lastReplyUser: '管理员',
  },
  {
    id: '2',
    isNew: true,
    title: '有没有人推荐一套适合新手的 COC 规则入门资料？',
    author: '星光旅者',
    replies: 12,
    views: 280,
    lastReplyAt: new Date(Date.now() - 900_000).toISOString(),
    lastReplyUser: '老玩家甲',
  },
  {
    id: '3',
    title: '我的第一个自制模组分享——《碎镜》',
    author: '创作者小王',
    replies: 8,
    views: 156,
    lastReplyAt: new Date(Date.now() - 7200_000).toISOString(),
    lastReplyUser: '路人乙',
  },
]);

const total = computed(() => threads.value.length);
const pagedThreads = computed(() => {
  const start = (page.value - 1) * pageSize;
  return threads.value.slice(start, start + pageSize);
});

function formatTime(iso: string) {
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
</script>

<template>
  <div class="forum-board">
    <div class="board-header">
      <h2 class="board-title">{{ boardLabel }}</h2>
      <TButton type="primary" size="sm">+ 发帖</TButton>
    </div>

    <!-- 帖子列表 -->
    <div class="thread-table">
      <!-- 表头 -->
      <div class="thread-row thread-head">
        <span class="col-title">标题</span>
        <span class="col-author">作者</span>
        <span class="col-num">回复</span>
        <span class="col-num">浏览</span>
        <span class="col-last">最后回复</span>
      </div>

      <div
        v-for="t in pagedThreads"
        :key="t.id"
        class="thread-row thread-item"
        :class="{ pinned: t.pinned }"
        @click="goThread(t.id)"
      >
        <!-- 标题 + 标签 -->
        <div class="col-title title-cell">
          <div class="title-tags">
            <TTag v-if="t.pinned" size="sm" color="warning">置顶</TTag>
            <TTag v-if="t.featured" size="sm" color="success">精华</TTag>
            <TTag v-if="t.isNew" size="sm" color="info">NEW</TTag>
          </div>
          <span class="thread-title">{{ t.title }}</span>
        </div>

        <span class="col-author author-name">{{ t.author }}</span>
        <span class="col-num">{{ t.replies }}</span>
        <span class="col-num">{{ t.views }}</span>
        <div class="col-last last-cell">
          <span>{{ formatTime(t.lastReplyAt) }}</span>
          <span class="last-user">{{ t.lastReplyUser }}</span>
        </div>
      </div>

      <div v-if="pagedThreads.length === 0" class="empty-state">
        暂无帖子，来发布第一篇吧！
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="totalPages > 1" class="pager">
      <button class="page-btn" :disabled="page <= 1" @click="page--">上一页</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="page-btn" :disabled="page >= totalPages" @click="page++">下一页</button>
    </div>
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
