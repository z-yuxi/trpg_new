<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import ActivityTimelineList from '../../components/community/ActivityTimelineList.vue';
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

const threadTimelineItems = computed(() =>
  threads.value.map((thread) => ({
    id: thread.id,
    title: thread.title,
    createdAtText: formatTime(thread.created_at),
    tagText: '发布了帖子',
    targetId: thread.id,
  }))
);

const postTimelineItems = computed(() =>
  posts.value.map((post) => ({
    id: post.id,
    title: post.thread_title,
    createdAtText: formatTime(post.created_at),
    tagText: '回复了帖子',
    targetId: post.thread_id,
    preview: `${post.content.slice(0, 80)}${post.content.length > 80 ? '...' : ''}`,
  }))
);

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
      <ActivityTimelineList
        :items="threadTimelineItems"
        empty-title="暂无发帖记录"
        empty-description="发布第一篇帖子后，这里会显示你的创作轨迹。"
        @open="(targetId) => router.push(`/discuss/thread/${targetId}`)"
      />
    </template>

    <template v-else>
      <ActivityTimelineList
        :items="postTimelineItems"
        empty-title="暂无回复记录"
        empty-description="参与一次讨论后，这里会记录你的互动内容。"
        @open="(targetId) => router.push(`/discuss/thread/${targetId}`)"
      />
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
</style>
