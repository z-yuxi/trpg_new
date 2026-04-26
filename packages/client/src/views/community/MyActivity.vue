<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TTag from '../../components/base/TTag.vue';
import EmptyState from '../../components/base/EmptyState.vue';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../utils/api';

interface ForumThread { id: string; title: string; reply_count: number; created_at: string; }
interface ForumPost { id: string; thread_id: string; content: string; floor_number: number; created_at: string; thread_title: string; }

const authStore = useAuthStore();
const router = useRouter();
const activeTab = ref<'threads' | 'posts'>('threads');
const threads = ref<ForumThread[]>([]);
const posts = ref<ForumPost[]>([]);
const loading = ref(false);

async function fetchActivity() {
  if (!authStore.isLoggedIn) return;
  loading.value = true;
  try {
    const body = await api.get<{ threads: ForumThread[]; posts: ForumPost[] }>('/users/me/activity');
    threads.value = body.threads;
    posts.value = body.posts;
  } catch (error: any) {
    ElMessage.error(error?.message ?? '加载动态失败');
  } finally {
    loading.value = false;
  }
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return d.toLocaleDateString();
  } catch {
    return '-';
  }
}

onMounted(fetchActivity);
</script>

<template>
  <div class="my-activity">
    <h2 class="page-title">我的动态</h2>

    <div class="tabs-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'threads' }" @click="activeTab = 'threads'">
        我发的帖 ({{ threads.length }})
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'posts' }" @click="activeTab = 'posts'">
        我的回复 ({{ posts.length }})
      </button>
    </div>

    <div v-if="loading" class="empty-state">加载中...</div>

    <template v-else-if="activeTab === 'threads'">
      <EmptyState
        v-if="threads.length === 0"
        icon-name=""
        illustration-name="illust-empty"
        :illustration-size="170"
        title="暂无发帖记录"
        description="发布第一篇帖子后，这里会显示你的创作轨迹。"
      />
      <div v-else class="timeline">
        <div v-for="(thread, index) in threads" :key="thread.id" class="timeline-item">
          <div class="timeline-axis">
            <div class="axis-dot"></div>
            <div v-if="index < threads.length - 1" class="axis-line"></div>
          </div>

          <div class="timeline-content">
            <div class="item-header">
              <TTag color="default" size="sm">发布了帖子</TTag>
              <span class="item-time">{{ formatTime(thread.created_at) }}</span>
            </div>
            <div class="item-title clickable" @click="router.push(`/community/thread/${thread.id}`)">{{ thread.title }}</div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <EmptyState
        v-if="posts.length === 0"
        icon-name=""
        illustration-name="illust-empty"
        :illustration-size="170"
        title="暂无回复记录"
        description="参与一次讨论后，这里会记录你的互动内容。"
      />
      <div v-else class="timeline">
        <div v-for="(post, index) in posts" :key="post.id" class="timeline-item">
          <div class="timeline-axis">
            <div class="axis-dot"></div>
            <div v-if="index < posts.length - 1" class="axis-line"></div>
          </div>

          <div class="timeline-content">
            <div class="item-header">
              <TTag color="default" size="sm">回复了帖子</TTag>
              <span class="item-time">{{ formatTime(post.created_at) }}</span>
            </div>
            <div class="item-title clickable" @click="router.push(`/community/thread/${post.thread_id}`)">{{ post.thread_title }}</div>
            <div class="reply-preview">{{ post.content.slice(0, 80) }}{{ post.content.length > 80 ? '...' : '' }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.my-activity { display: flex; flex-direction: column; gap: var(--space-4); }
.page-title { font-size: var(--text-xl); font-weight: var(--font-bold); color: var(--text-primary); }

.tabs-bar {
  display: flex;
  gap: var(--space-2);
}

.tab-btn {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  background: var(--surface-base);
  color: var(--text-body);
  cursor: pointer;
}

.tab-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--btn-primary-text);
}

.empty-state {
  text-align: center;
  padding: var(--space-8);
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* 时间线 */
.timeline { display: flex; flex-direction: column; }

.timeline-item {
  display: flex;
  gap: var(--space-4);
}

.timeline-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 16px;
}

.axis-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  border: 2px solid var(--surface-page);
  box-shadow: 0 0 0 2px var(--color-primary);
  flex-shrink: 0;
  margin-top: 4px;
}

.axis-line {
  width: 2px;
  flex: 1;
  background: var(--border-default);
  min-height: 24px;
  margin: var(--space-1) 0;
}

.timeline-content {
  flex: 1;
  padding-bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.item-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.item-time { font-size: var(--text-xs); color: var(--text-muted); }

.item-title {
  font-size: var(--text-sm);
  color: var(--text-body);
  line-height: var(--leading-normal);
}

.item-title.clickable {
  cursor: pointer;
}

.item-title.clickable:hover {
  color: var(--color-primary);
}

.reply-preview {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: var(--leading-normal);
}
</style>
