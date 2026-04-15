<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TTag from '../components/base/TTag.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import { useAuthStore } from '../stores/auth-store';
import { useCampaignStore } from '../stores/campaign-store';

const authStore = useAuthStore();
const campaignStore = useCampaignStore();
const router = useRouter();

// Mock 数据
const recentCampaigns = ref([
  { id: '1', name: '克苏鲁之陟崖', status: 'running', room_code: 'ABC123', gm_nickname: '星际迷途' },
  { id: '2', name: '黑暗幻想纪', status: 'preparing', room_code: 'XYZ789', gm_nickname: '深海孤影' },
]);

const recommendedRulesets = ref([
  { id: '1', name: '克苏鲁神话', version: '7.0', description: '经典恐怖TRPG规则集' },
  { id: '2', name: 'D&D 5e', version: '5.0', description: '龙与地下城第五版规则' },
]);

const activities = ref([
  { id: '1', user: '星际迷途', action: '开始了新团 「克苏鲁之陟崖」', time: '2小时前' },
  { id: '2', user: '深海孤影', action: '发布了招募帖', time: '4小时前' },
  { id: '3', user: '月影追风', action: '上传了规则集 「黑暗幻想」', time: '昨天' },
]);

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'danger' }> = {
  running: { label: '进行中', color: 'success' },
  preparing: { label: '准备中', color: 'warning' },
  paused: { label: '已暂停', color: 'default' },
  ended: { label: '已结束', color: 'danger' },
};
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
        <TCard
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
          <div class="campaign-gm">GM: {{ c.gm_nickname }}</div>
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
      <div class="activity-list">
        <div v-for="act in activities" :key="act.id" class="activity-item">
          <div class="activity-avatar">{{ act.user[0] }}</div>
          <div class="activity-body">
            <span class="activity-user">{{ act.user }}</span>
            <span class="activity-action"> {{ act.action }}</span>
            <span class="activity-time">{{ act.time }}</span>
          </div>
        </div>
      </div>
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
