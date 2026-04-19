<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import TButton from '../../components/base/TButton.vue';

interface Post {
  floor: number;
  author: string;
  avatarChar: string;
  content: string;
  createdAt: string;
}

const route = useRoute();
const threadId = route.params.id as string;

// TODO: 后端 GET /api/forum/threads/:id 接口实现后替换此本地数据
const title = ref('有没有人推荐一套适合新手的 COC 规则入门资料？');
const posts = ref<Post[]>([
  {
    floor: 1,
    author: '星光旅者',
    avatarChar: '星',
    content: '我是新人，最近想入坑 COC，但感觉规则书太多太乱，有没有大佬推荐一个学习路径？',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    floor: 2,
    author: '老玩家甲',
    avatarChar: '老',
    content: '建议先看《克苏鲁神话TRPG》第七版规则书，然后直接跑一个新手模组《梦境追踪者》，边玩边学最快。',
    createdAt: new Date(Date.now() - 2400_000).toISOString(),
  },
  {
    floor: 3,
    author: '路人乙',
    avatarChar: '路',
    content: '同意楼上，另外 B 站有很多实际游戏视频，看看别人怎么跑团也很有帮助。',
    createdAt: new Date(Date.now() - 1200_000).toISOString(),
  },
]);

const replyContent = ref('');
const submitting = ref(false);

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '-';
  }
}

function submitReply() {
  const text = replyContent.value.trim();
  if (!text) return;
  // TODO: POST /api/forum/threads/:id/posts
  posts.value.push({
    floor: posts.value.length + 1,
    author: '我',
    avatarChar: '我',
    content: text,
    createdAt: new Date().toISOString(),
  });
  replyContent.value = '';
}
</script>

<template>
  <div class="thread-detail">
    <h1 class="thread-title">{{ title }}</h1>

    <!-- 帖子楼层列表 -->
    <div class="posts-list">
      <div v-for="post in posts" :key="post.floor" class="post-item">
        <!-- 左侧：楼层 + 头像 -->
        <div class="post-left">
          <div class="avatar">{{ post.avatarChar }}</div>
          <div class="floor-num">#{{ post.floor }}</div>
        </div>

        <!-- 右侧：内容 -->
        <div class="post-body">
          <div class="post-header">
            <span class="post-author">{{ post.author }}</span>
            <span class="post-time">{{ formatTime(post.createdAt) }}</span>
          </div>
          <div class="post-content">{{ post.content }}</div>
        </div>
      </div>
    </div>

    <!-- 回复输入区 -->
    <div class="reply-box">
      <h3 class="reply-title">发表回复</h3>
      <textarea
        v-model="replyContent"
        class="reply-textarea"
        placeholder="写下你的回复..."
        rows="4"
        maxlength="2000"
      />
      <div class="reply-actions">
        <span class="char-count">{{ replyContent.length }} / 2000</span>
        <TButton type="primary" :loading="submitting" @click="submitReply">回复</TButton>
      </div>
    </div>
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
</style>
