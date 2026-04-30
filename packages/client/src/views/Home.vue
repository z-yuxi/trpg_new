<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import { useAuthStore } from '../stores/auth-store';
import { getTrendingModules, getTrendingStories } from '../api/trending';
import type { TrendingModule, TrendingStory } from '../api/trending';

const authStore = useAuthStore();
const router = useRouter();

const modules = ref<TrendingModule[]>([]);
const stories = ref<TrendingStory[]>([]);
const loading = ref(false);

/** 将 top_badge 转换为可显示字符串 */
function badgeLabel(badge: TrendingModule['top_badge']): string {
  if (badge.type === 'featured') return '⭐申精';
  if (badge.type === 'comment') return `💬${badge.count}`;
  return `❤️${badge.count}`;
}

onMounted(async () => {
  if (authStore.isLoggedIn) {
    router.replace('/explore');
    return;
  }

  loading.value = true;
  try {
    const [mData, sData] = await Promise.all([
      getTrendingModules(4).catch(() => null),
      getTrendingStories(4).catch(() => null),
    ]);

    if (mData) modules.value = mData.data ?? [];
    if (sData) stories.value = sData.data ?? [];
  } catch { /* silent */ } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="home-page">
    <section class="entry-block">
      <h1 class="entry-title">共叙，专注人与人之间的共同叙事</h1>
      <p class="entry-subtitle">与同好相遇，在文字里共同推进一场故事。</p>
      <button class="btn-accent" @click="router.push('/login')">进入叙事</button>
    </section>

    <!-- 精选模组：数据为 0 时隐藏整个区域 -->
    <section v-if="loading || modules.length > 0" class="section">
      <h2 class="section-title">精选模组</h2>
      <div v-if="loading" class="grid-list">
        <TSkeleton type="card" v-for="i in 4" :key="`m-${i}`" />
      </div>
      <div v-else class="grid-list">
        <TCard v-for="item in modules" :key="item.id" class="preview-card">
          <div class="preview-card-header">
            <div class="preview-title">{{ item.name }}</div>
            <span class="hot-badge">{{ badgeLabel(item.top_badge) }}</span>
          </div>
          <p class="preview-desc">{{ item.description || '暂无简介' }}</p>
        </TCard>
      </div>
    </section>

    <!-- 热门故事：数据为 0 时隐藏整个区域 -->
    <section v-if="loading || stories.length > 0" class="section">
      <h2 class="section-title">热门故事</h2>
      <div v-if="loading" class="grid-list">
        <TSkeleton type="card" v-for="i in 4" :key="`s-${i}`" />
      </div>
      <div v-else class="grid-list">
        <TCard v-for="item in stories" :key="item.id" class="preview-card">
          <div class="preview-card-header">
            <div class="preview-title">{{ item.title }}</div>
            <span class="hot-badge">{{ badgeLabel(item.top_badge) }}</span>
          </div>
          <p class="preview-desc">{{ item.summary || '新的故事正在发生' }}</p>
        </TCard>
      </div>
    </section>

    <footer class="home-footer">
      <span>© 2026 共叙</span>
      <span>备案号</span>
      <span>联系我们</span>
      <span>协议</span>
    </footer>
  </div>
</template>

<style scoped>
.home-page { max-width: 1100px; margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-8); }
.entry-block {
  padding: var(--space-7) var(--space-5);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  text-align: center;
  margin-bottom: var(--space-7);
}
.entry-title { font-size: var(--text-2xl); font-weight: 800; margin: 0 0 var(--space-3); color: var(--text-primary); }
.entry-subtitle { font-size: var(--text-base); color: var(--text-secondary); margin: 0 0 var(--space-4); }
.section { margin-bottom: var(--space-7); }
.section-title { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin: 0; }
.hint-text { font-size: var(--text-sm); color: var(--text-muted); padding: var(--space-3) 0; }
.preview-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.hot-badge {
  flex-shrink: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-overlay, rgba(0,0,0,0.06));
  color: var(--text-secondary);
  white-space: nowrap;
}
.btn-accent { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); border: none; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 700; font-size: var(--text-sm); cursor: pointer; }
.grid-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3); }
.preview-card { border: 1px solid var(--border-default); }
.preview-title { font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-2); }
.preview-desc { font-size: var(--text-xs); color: var(--text-secondary); margin: 0; }
.home-footer {
  border-top: 1px solid var(--border-default);
  padding-top: var(--space-4);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  color: var(--text-muted);
  font-size: var(--text-xs);
}
@media (max-width: 768px) {
  .grid-list { grid-template-columns: 1fr; }
  .entry-title { font-size: var(--text-xl); }
}
</style>