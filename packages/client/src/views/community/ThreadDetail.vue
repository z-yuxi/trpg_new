<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import TButton from '../../components/base/TButton.vue';
import EmptyState from '../../components/base/EmptyState.vue';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../utils/api';

interface Post {
  id: string;
  floor_number: number;
  author_nickname?: string;
  content: string;
  created_at: string;
  reply_to_post_id?: string | null;
}

interface ThreadDetail {
  id: string;
  title: string;
  content: string;
  author_nickname?: string;
  view_count: number;
  reply_count: number;
  is_locked: boolean;
}

interface ThreadResponse {
  thread: ThreadDetail;
  posts: Post[];
  total_posts: number;
  page: number;
  limit: number;
  has_more: boolean;
}

const route = useRoute();
const authStore = useAuthStore();
const threadId = route.params['id'] as string;

const thread = ref<ThreadDetail | null>(null);
const posts = ref<Post[]>([]);
const loading = ref(false);
const replyContent = ref('');
const submitting = ref(false);
const replyToId = ref<string | null>(null);
const currentPage = ref(1);
const pageSize = 20;
const hasMore = ref(false);

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(value: string) {
  const safe = escapeHtml(value);
  return safe
    .replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br />');
}

function findReplyTarget(replyToPostId?: string | null) {
  if (!replyToPostId) return null;
  return posts.value.find((item) => item.id === replyToPostId) ?? null;
}

async function fetchThread(page = 1, append = false) {
  loading.value = true;
  try {
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    const body = await api.get<ThreadResponse>(`/forum/threads/${threadId}?${params}`);
    thread.value = body.thread;
    posts.value = append ? posts.value.concat(body.posts) : body.posts;
    currentPage.value = body.page;
    hasMore.value = body.has_more;
  } catch (error: any) {
    ElMessage.error(error?.message ?? '加载失败');
  } finally {
    loading.value = false;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '-';
  }
}

async function submitReply() {
  const text = replyContent.value.trim();
  if (!text) return;
  if (!authStore.isLoggedIn) { ElMessage.warning('请先登录'); return; }
  submitting.value = true;
  try {
    const body: Record<string, string> = { content: text };
    if (replyToId.value) body['reply_to_post_id'] = replyToId.value;
    const post = await api.post<Post>(`/forum/threads/${threadId}/posts`, body);
    posts.value.push(post);
    if (thread.value) thread.value.reply_count += 1;
    replyContent.value = '';
    replyToId.value = null;
    ElMessage.success('回复成功');
  } catch (e: any) {
    ElMessage.error(e?.message ?? '回复失败');
  } finally {
    submitting.value = false;
  }
}

function quoteReply(post: Post) {
  replyToId.value = post.id;
  replyContent.value = `> 引用 ${post.author_nickname ?? '匿名'} #${post.floor_number}楼：${post.content.slice(0, 50)}...\n`;
}

function loadMorePosts() {
  if (!hasMore.value || loading.value) return;
  fetchThread(currentPage.value + 1, true);
}

onMounted(fetchThread);
</script>

<template>
  <div class="thread-detail">
    <template v-if="thread">
      <h1 class="thread-title">{{ thread.title }}</h1>
      <div class="thread-meta">
        <span>作者：{{ thread.author_nickname ?? '-' }}</span>
        <span>浏览：{{ thread.view_count }}</span>
        <span>回复：{{ thread.reply_count }}</span>
        <span v-if="thread.is_locked" class="locked-tag">已锁帖</span>
      </div>

      <!-- 帖子楼层列表（楼主+回帖） -->
      <div class="posts-list">
        <!-- 楼主帖 -->
        <div class="post-item op-post">
          <div class="post-left">
            <div class="avatar">{{ (thread.author_nickname ?? '?')[0] }}</div>
            <div class="floor-num">#1</div>
          </div>
          <div class="post-body">
            <div class="post-header">
              <span class="post-author">{{ thread.author_nickname ?? '-' }}</span>
            </div>
            <div class="post-content markdown-body" v-html="renderMarkdown(thread.content)"></div>
          </div>
        </div>

        <div v-for="post in posts" :key="post.id" class="post-item">
          <div class="post-left">
            <div class="avatar">{{ (post.author_nickname ?? '?')[0] }}</div>
            <div class="floor-num">#{{ post.floor_number }}</div>
          </div>
          <div class="post-body">
            <div class="post-header">
              <span class="post-author">{{ post.author_nickname ?? '-' }}</span>
              <span class="post-time">{{ formatTime(post.created_at) }}</span>
              <button v-if="!thread.is_locked" class="quote-btn" @click="quoteReply(post)">引用</button>
            </div>
            <div v-if="findReplyTarget(post.reply_to_post_id)" class="quote-preview">
              引用 #{{ findReplyTarget(post.reply_to_post_id)?.floor_number }} {{ findReplyTarget(post.reply_to_post_id)?.author_nickname || '匿名' }}
            </div>
            <div class="post-content markdown-body" v-html="renderMarkdown(post.content)"></div>
          </div>
        </div>
      </div>

      <div v-if="hasMore" class="load-more-wrap">
        <TButton type="ghost" :loading="loading" @click="loadMorePosts">加载更多</TButton>
      </div>

      <!-- 回复输入区 -->
      <div v-if="!thread.is_locked" class="reply-box">
        <h3 class="reply-title">发表回复</h3>
        <textarea
          v-model="replyContent"
          class="reply-textarea"
          placeholder="写下你的回复..."
          rows="4"
          maxlength="10000"
        />
        <div class="reply-actions">
          <span class="char-count">{{ replyContent.length }} / 10000</span>
          <TButton type="primary" :loading="submitting" @click="submitReply">回复</TButton>
        </div>
      </div>
      <div v-else class="locked-notice">该帖已锁定，无法回复。</div>
    </template>

    <div v-else-if="loading" class="loading-state">加载中...</div>
    <EmptyState
      v-else
      icon-name=""
      illustration-name="illust-404"
      title="帖子不存在"
      description="该帖子可能已被删除或你没有访问权限。"
    />
  </div>
</template>

<style scoped>
.thread-detail {
  max-width: 860px;
  margin: 0 auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.thread-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  line-height: var(--leading-tight);
}

/* 帖子列表 */
.posts-list { display: flex; flex-direction: column; gap: var(--space-3); }

.post-item {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
}

.post-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--btn-primary-text, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
}

.floor-num {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
}

.post-body { flex: 1; min-width: 0; }

.post-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.post-author { font-weight: var(--font-semibold); font-size: var(--text-sm); color: var(--text-primary); }
.post-time { font-size: var(--text-xs); color: var(--text-muted); }

.post-content {
  font-size: var(--text-sm);
  color: var(--text-body);
  line-height: var(--leading-relaxed);
  white-space: pre-wrap;
}
.markdown-body :deep(blockquote) {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-3);
  border-left: 3px solid color-mix(in srgb, var(--color-primary, #5B8DB8) 45%, transparent);
  color: var(--text-secondary);
}
.markdown-body :deep(code) {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--surface-hover) 70%, transparent);
  font-size: 0.95em;
}
.quote-preview {
  margin-bottom: var(--space-2);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

/* 回复框 */
.reply-box {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.reply-title { font-size: var(--text-base); font-weight: var(--font-semibold); color: var(--text-primary); }

.reply-textarea {
  width: 100%;
  padding: var(--space-3);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-body);
  font-size: var(--text-sm);
  resize: vertical;
  outline: none;
  font-family: inherit;
  line-height: var(--leading-relaxed);
  transition: border-color var(--transition-fast);
  box-sizing: border-box;
}
.reply-textarea:focus { border-color: var(--color-primary); }

.reply-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.char-count { font-size: var(--text-xs); color: var(--text-muted); }
.thread-meta { display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--text-muted); }
.locked-tag { color: var(--color-warning); }
.quote-btn { margin-left: auto; font-size: var(--text-xs); color: var(--text-muted); background: none; border: none; cursor: pointer; }
.quote-btn:hover { color: var(--color-primary); }
.op-post { background: color-mix(in srgb, var(--color-primary-light, #e0eaff) 20%, transparent); }
.locked-notice { text-align: center; color: var(--text-muted); padding: var(--space-4); }
.loading-state { text-align: center; color: var(--text-muted); padding: var(--space-8); }
.empty-state { text-align: center; color: var(--text-muted); padding: var(--space-8); }
.load-more-wrap { display: flex; justify-content: center; }
</style>
