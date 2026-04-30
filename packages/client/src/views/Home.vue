<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import { useAuthStore } from '../stores/auth-store';
import { discoverRulesets, discoverModules } from '../api/assets';
import { listRecruitments } from '../api/recruitment';

const authStore = useAuthStore();
const router = useRouter();

const rulesets = ref<any[]>([]);
const modules = ref<any[]>([]);
const stories = ref<any[]>([]);
const loading = ref(false);

onMounted(async () => {
  if (authStore.isLoggedIn) {
    router.replace('/explore');
    return;
  }

  loading.value = true;
  try {
    const [rData, mData, recData] = await Promise.all([
      discoverRulesets({ limit: 6 }).catch(() => null),
      discoverModules({ limit: 6 }).catch(() => null),
      listRecruitments({ limit: 5 }).catch(() => null),
    ]);

    if (rData) rulesets.value = (rData.data ?? []).slice(0, 6);
    if (mData) modules.value = (mData.data ?? []).slice(0, 6);
    if (recData) stories.value = (recData as unknown[]).slice(0, 4);
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

    <section class="section">
      <h2 class="section-title">精选模组</h2>
      <div v-if="loading" class="grid-list">
        <TSkeleton type="card" v-for="i in 4" :key="`m-${i}`" />
      </div>
      <div v-else-if="modules.length === 0" class="hint-text">暂无精选模组</div>
      <div v-else class="grid-list">
        <TCard v-for="item in modules.slice(0, 4)" :key="item.id" class="preview-card">
          <div class="preview-title">{{ item.name }}</div>
          <p class="preview-desc">{{ item.description || '暂无简介' }}</p>
        </TCard>
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">热门故事</h2>
      <div v-if="loading" class="grid-list">
        <TSkeleton type="card" v-for="i in 4" :key="`s-${i}`" />
      </div>
      <div v-else-if="stories.length === 0" class="hint-text">暂无热门故事</div>
      <div v-else class="grid-list">
        <TCard v-for="item in stories" :key="item.id" class="preview-card">
          <div class="preview-title">{{ item.title ?? item.campaign_name }}</div>
          <p class="preview-desc">{{ item.description ?? '新的故事正在发生' }}</p>
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