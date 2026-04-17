<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TTag from '../components/base/TTag.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import { useAuthStore } from '../stores/auth-store';

const authStore = useAuthStore();
const router = useRouter();

const recentCampaigns = ref<any[]>([]);
const recommendedRulesets = ref<any[]>([]);
const loading = ref(false);
const apiError = ref('');

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'danger' }> = {
  running: { label: '进行中', color: 'success' },
  preparing: { label: '准备中', color: 'warning' },
  paused: { label: '已暂停', color: 'default' },
  ended: { label: '已结束', color: 'danger' },
};

onMounted(async () => {
  if (!authStore.isLoggedIn) return;
  loading.value = true;
  apiError.value = '';
  try {
    const [campaignsRes, rulesetsRes] = await Promise.all([
      fetch('/api/campaigns', { headers: { Authorization: `Bearer ${authStore.token}` } }),
      fetch('/api/rulesets'),
    ]);
    if (campaignsRes.ok) {
      const data = await campaignsRes.json();
      recentCampaigns.value = (Array.isArray(data) ? data : []).slice(0, 3);
    }
    if (rulesetsRes.ok) {
      const data = await rulesetsRes.json();
      recommendedRulesets.value = (Array.isArray(data) ? data : []).slice(0, 4);
    }
  } catch (e: any) {
    apiError.value = e.message || '加载失败';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="home-page">
    <!-- 快速入团 -->
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">最近的团</h2>
        <TButton type="ghost" size="sm" @click="router.push('/campaigns')">查看全部</TButton>
      </div>

      <div v-if="!authStore.isLoggedIn" class="login-tip">
        <TCard padding="md">
          <p>登录后查看你参与的团</p>
          <TButton type="primary" size="sm" @click="router.push('/login')" style="margin-top:8px">立即登录</TButton>
        </TCard>
      </div>

      <div v-else class="campaigns-scroll">
        <div v-if="loading" class="loading-tip">加载中...</div>
        <div v-else-if="apiError" class="error-tip">{{ apiError }}</div>
        <div v-else-if="recentCampaigns.length === 0" class="empty-tip">暂无跑团，<span class="link" @click="router.push('/campaigns')">去创建</span></div>
        <TCard
          v-else
          v-for="c in recentCampaigns"
          :key="c.id"
          padding="md"
          hoverable
          class="campaign-card"
          @click="router.push(`/room/${c.id}`)"
        >
          <div class="campaign-name">{{ c.name }}</div>
          <div class="campaign-meta">
            <TTag :color="statusMap[c.status]?.color" size="sm">{{ statusMap[c.status]?.label }}</TTag>
            <span class="room-code">{{ c.room_code }}</span>
          </div>
        </TCard>
      </div>
    </section>

    <!-- 推荐规则集 -->
    <section class="section">
      <h2 class="section-title">热门规则集</h2>
      <div class="grid-2">
        <TCard
          v-for="rs in recommendedRulesets"
          :key="rs.id"
          padding="md"
          hoverable
          @click="router.push('/assets')"
        >
          <div class="ruleset-name">{{ rs.name }}</div>
          <div class="ruleset-version">v{{ rs.version }}</div>
          <p class="ruleset-desc">{{ rs.description }}</p>
        </TCard>
      </div>
    </section>

    <!-- 动态流 -->
    <section class="section">
      <h2 class="section-title">最新动态</h2>
      <div class="activity-empty">暂无动态</div>
    </section>
  </div>
</template>

<style scoped>
.home-page { max-width: 900px; margin: 0 auto; }
.section { margin-bottom: var(--space-8); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-title { font-size: var(--text-lg); font-weight: 600; color: var(--color-text-primary); }
.campaigns-scroll { display: flex; gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-2); }
.campaign-card { min-width: 200px; cursor: pointer; }
.campaign-name { font-weight: 600; margin-bottom: var(--space-2); }
.campaign-meta { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.room-code { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); }
.campaign-gm { font-size: var(--text-xs); color: var(--color-text-secondary); }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--space-4); }
.ruleset-name { font-weight: 600; }
.ruleset-version { font-size: var(--text-xs); color: var(--color-text-muted); margin: 2px 0 var(--space-2); }
.ruleset-desc { font-size: var(--text-sm); color: var(--color-text-secondary); }
.activity-list { display: flex; flex-direction: column; gap: var(--space-3); }
.activity-item { display: flex; align-items: flex-start; gap: var(--space-3); }
.activity-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; flex-shrink: 0;
}
.activity-body { font-size: var(--text-sm); line-height: 1.6; }
.activity-user { font-weight: 600; }
.activity-time { margin-left: var(--space-2); color: var(--color-text-muted); font-size: var(--text-xs); }
.login-tip { text-align: center; }
</style>
