<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TTag from '../components/base/TTag.vue';
import TCard from '../components/base/TCard.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import SvgIcon from '../components/SvgIcon.vue';
import QuickCreateCampaignDialog from '../components/campaign/QuickCreateCampaignDialog.vue';
import { useAuthStore } from '../stores/auth-store';
import { api } from '../utils/api';

const authStore = useAuthStore();
const router = useRouter();

const campaigns = ref<any[]>([]);
const rulesets = ref<any[]>([]);
const modules = ref<any[]>([]);
const recruitments = ref<any[]>([]);
const loading = ref(false);
const showQuickCreate = ref(false);

/** "当GM"快速入口：已登录弹向导，未登录跳登录 */
function handleCreateCampaign() {
  if (!authStore.isLoggedIn) {
    router.push('/login');
    return;
  }
  showQuickCreate.value = true;
}

function handleCampaignCreated(payload: { campaignId: string; recruitmentPostId: string | null }) {
  if (payload.recruitmentPostId) {
    router.push(`/community/${payload.recruitmentPostId}`);
  } else {
    router.push(`/room/${payload.campaignId}`);
  }
}

const quickActions = [
  { icon: 'icon-search',   title: '找团玩', desc: '浏览招募并加入适合你的团', path: '/recruit', action: null },
  { icon: 'icon-dice',     title: '当 GM', desc: '创建房间并开始组织你的队伍', path: null, action: handleCreateCampaign },
  { icon: 'icon-megaphone',title: '发求组帖', desc: '告诉大家你正在寻找什么团', path: '/recruit?action=post', action: null },
];

const mixedRecommendations = computed(() => [
  ...modules.value.slice(0, 2).map((item) => ({ id: `m-${item.id}`, type: 'module', title: item.name, subtitle: item.ruleset_name || '模组', desc: item.description })),
  ...rulesets.value.slice(0, 2).map((item) => ({ id: `r-${item.id}`, type: 'ruleset', title: item.name, subtitle: `v${item.version ?? '1.0'}`, desc: item.description })),
  ...recruitments.value.slice(0, 2).map((item) => ({ id: `q-${item.id}`, type: 'recruitment', title: item.title ?? item.campaign_name, subtitle: '招募动态', desc: item.description ?? '新的招募动态' })),
]);

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'danger' }> = {
  running: { label: '进行中', color: 'success' },
  preparing: { label: '准备中', color: 'warning' },
  paused: { label: '已暂停', color: 'default' },
  ended: { label: '已结束', color: 'danger' },
};

onMounted(async () => {
  loading.value = true;
  try {
    const [cData, rData, mData, recData] = await Promise.all([
      authStore.isLoggedIn ? api.get<unknown[]>('/campaigns') : Promise.resolve(null),
      api.get<unknown>('/rulesets?limit=6').catch(() => null),
      api.get<unknown>('/modules?limit=6').catch(() => null),
      api.get<unknown[]>('/recruitment?limit=5').catch(() => null),
    ]);
    if (cData) campaigns.value = (cData as unknown[]).slice(0, 6);
    if (rData) {
      const d = rData as { data?: unknown[] } | unknown[];
      rulesets.value = Array.isArray((d as { data?: unknown[] }).data) ? ((d as { data: unknown[] }).data).slice(0, 6) : Array.isArray(d) ? (d as unknown[]).slice(0, 6) : [];
    }
    if (mData) {
      const d = mData as { data?: unknown[] };
      modules.value = Array.isArray(d?.data) ? d.data!.slice(0, 6) : [];
    }
    if (recData) recruitments.value = (recData as unknown[]).slice(0, 5);
  } catch { /* silent */ } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="home-page">
    <section class="hero-banner">
      <h1 class="hero-title">共叙，专注人与人之间的共同叙事</h1>
      <p class="hero-subtitle">在这里，与同好相聚，共同书写属于彼此的故事。</p>
    </section>

    <div class="content-layout">
      <div class="main-col">
        <section class="section" v-if="authStore.isLoggedIn">
          <div class="section-header">
            <h2 class="section-title">进行中的团</h2>
            <button class="see-all" @click="router.push('/rooms')">查看全部 ›</button>
          </div>
          <div v-if="loading" class="campaign-scroll">
            <TSkeleton type="card" v-for="i in 3" :key="i" style="min-width:160px;flex-shrink:0" />
          </div>
          <div v-else-if="campaigns.length === 0" class="hint-text">
            暂无战役，<span class="link" @click="router.push('/rooms')">去创建</span>
          </div>
          <div v-else class="campaign-scroll">
            <div v-for="c in campaigns" :key="c.id" class="campaign-scroll-item" @click="router.push(`/room/${c.id}`)">
              <TCard padding="none" hoverable :elevated="c.status === 'running'" :status="c.status">
                <div class="campaign-cover">
                  <img v-if="c.cover_url" class="cover-image" :src="c.cover_url" :alt="c.name" />
                  <div v-else class="cover-fallback" aria-hidden="true">
                    <SvgIcon :name="c.module_id ? 'icon-market' : 'icon-ruleset'" :size="40" class="fallback-icon" />
                  </div>
                </div>
                <div class="campaign-info">
                  <div class="campaign-name">{{ c.name }}</div>
                  <div class="campaign-meta">
                    <TTag :color="statusMap[c.status]?.color ?? 'default'" size="sm">{{ statusMap[c.status]?.label ?? c.status }}</TTag>
                    <span class="mono-sm">{{ c.room_code }}</span>
                  </div>
                </div>
              </TCard>
            </div>
          </div>
        </section>

        <section class="section" v-if="!authStore.isLoggedIn">
          <div class="cta-card">
            <h3>加入一场共叙，开始你的故事</h3>
            <p>登录后可以创建或参与跑团战役</p>
            <button class="btn-accent" @click="router.push('/login')">立即登录</button>
          </div>
        </section>

        <section class="section quick-section">
          <div class="section-header">
            <h2 class="section-title">快速招募入口</h2>
          </div>
          <div class="quick-grid">
            <button
              v-for="item in quickActions"
              :key="item.title"
              class="quick-action-card"
              @click="item.action ? item.action() : router.push(item.path!)"
            >
              <SvgIcon :name="item.icon" :size="24" class="quick-icon" />
              <strong>{{ item.title }}</strong>
              <span class="quick-desc">{{ item.desc }}</span>
            </button>
          </div>
        </section>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">为你推荐</h2>
            <button class="see-all" @click="router.push('/explore')">查看探索 ›</button>
          </div>
          <div v-if="loading" class="ruleset-grid">
            <TSkeleton type="card" v-for="i in 6" :key="i" />
          </div>
          <div v-else-if="mixedRecommendations.length === 0" class="hint-text">暂无推荐内容</div>
          <div v-else class="ruleset-grid">
            <div v-for="item in mixedRecommendations" :key="item.id" class="ruleset-card" @click="router.push(item.type === 'recruitment' ? '/recruit' : '/explore')">
              <div class="ruleset-icon">
                <SvgIcon :name="item.type === 'module' ? 'icon-market' : item.type === 'ruleset' ? 'icon-ruleset' : 'icon-recruit'" :size="20" />
              </div>
              <div class="ruleset-body">
                <div class="ruleset-name">{{ item.title }}</div>
                <div class="ruleset-version">{{ item.subtitle }}</div>
                <p class="ruleset-desc">{{ item.desc || '暂无简介' }}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside class="side-col">
        <div class="side-card">
          <div class="side-title">热门招募</div>
          <div v-if="recruitments.length === 0" class="hint-text">暂无招募信息</div>
          <div v-for="r in recruitments" :key="r.id" class="recruit-item" @click="router.push(`/recruit/${r.id}`)">
            <div class="recruit-name">{{ r.title ?? r.campaign_name }}</div>
            <div class="recruit-meta">{{ r.current_players ?? 0 }}/{{ r.max_players ?? '?' }} 人</div>
          </div>
          <button class="see-all-block" @click="router.push('/recruit')">查看全部招募 ›</button>
        </div>
        <div class="side-card">
          <div class="side-title">最近动态</div>
          <div v-if="recruitments.length === 0" class="hint-text">暂无动态</div>
          <div v-else class="feed-list">
            <div v-for="item in recruitments.slice(0, 3)" :key="item.id" class="feed-item">
              <strong>{{ item.title ?? item.campaign_name }}</strong>
              <span>{{ item.description ?? '新的招募动态' }}</span>
            </div>
          </div>
        </div>
        <div class="side-card">
          <div class="side-title">新手指南</div>
          <div class="guide-list">
            <button class="guide-link" @click="router.push('/getting-started#join')">1. 创建或加入团</button>
            <button class="guide-link" @click="router.push('/getting-started#assets')">2. 浏览规则集和模组</button>
            <button class="guide-link" @click="router.push('/getting-started#recruit')">3. 去社区发起或加入招募</button>
          </div>
        </div>
      </aside>
    </div>

    <QuickCreateCampaignDialog
      v-model:visible="showQuickCreate"
      :rulesets="rulesets as any[]"
      :modules="modules as any[]"
      @created="handleCampaignCreated"
    />
  </div>
</template>

<style scoped>
.home-page { max-width: 1100px; margin: 0 auto; padding: 0 var(--space-4) var(--space-8); }
.hero-banner {
  background: linear-gradient(135deg, #5B8DB8 0%, #4A7A9F 50%, #3D6A8F 100%);
  border-radius: 12px;
  padding: 32px 24px;
  margin-bottom: 24px;
  position: relative;
  overflow: hidden;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.hero-banner::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}
.hero-banner::after {
  content: '';
  position: absolute;
  top: -30%;
  right: -15%;
  width: 250px;
  height: 250px;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 50%;
  pointer-events: none;
}
.hero-title {
  font-size: var(--text-2xl);
  font-weight: 800;
  margin: 0 0 var(--space-2);
  color: rgba(255, 255, 255, 0.95);
  position: relative;
}
.hero-subtitle {
  font-size: var(--text-base);
  color: rgba(255, 255, 255, 0.8);
  margin: 0;
  position: relative;
}
.content-layout { display: grid; grid-template-columns: 1fr 280px; gap: var(--space-6); align-items: start; }
.main-col { min-width: 0; }
.side-col { display: flex; flex-direction: column; gap: var(--space-4); }
.section { margin-bottom: var(--space-7); }
.quick-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
.quick-action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  text-align: center;
  padding: var(--space-5) var(--space-4);
  border: 1.5px dashed var(--border-default, #D0D5DD);
  border-radius: 8px;
  background: var(--surface-card, #fff);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.quick-action-card:hover {
  border-color: #5B8DB8;
  background: rgba(91, 141, 184, 0.04);
  transform: translateY(-2px);
}
.quick-action-card .quick-icon { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
.quick-action-card strong { color: var(--text-primary); font-size: var(--text-sm); font-weight: 600; }
.quick-action-card .quick-desc { color: var(--text-secondary); font-size: var(--text-xs); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-title { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin: 0; }
.see-all { background: none; border: none; color: var(--color-accent); font-size: var(--text-sm); cursor: pointer; }
.hint-text { font-size: var(--text-sm); color: var(--text-muted); padding: var(--space-3) 0; }
.link { color: var(--color-accent); cursor: pointer; }
.campaign-scroll { display: flex; gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-2); scrollbar-width: none; }
.campaign-scroll::-webkit-scrollbar { display: none; }
.campaign-scroll-item { min-width: 220px; flex-shrink: 0; cursor: pointer; }
.campaign-scroll-item :deep(.t-card) { overflow: hidden; }
.campaign-cover { height: 120px; background: var(--surface-hover); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.cover-image { width: 100%; height: 100%; object-fit: cover; }
.cover-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.fallback-icon { color: var(--color-primary); opacity: 0.5; }
.campaign-info { padding: var(--space-3); }
.campaign-name { font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); margin-bottom: var(--space-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.campaign-meta { display: flex; align-items: center; gap: var(--space-2); }
.mono-sm { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); }
.cta-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-6); text-align: center; }
.cta-card h3 { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin: 0 0 var(--space-2); }
.cta-card p { font-size: var(--text-sm); color: var(--text-secondary); margin: 0 0 var(--space-4); }
.btn-accent { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); border: none; background: var(--btn-primary-bg); color: var(--btn-primary-text); font-weight: 700; font-size: var(--text-sm); cursor: pointer; }
.ruleset-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
.ruleset-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-4); cursor: pointer; transition: border-color var(--transition-fast); display: flex; gap: var(--space-3); }
.ruleset-card:hover { border-color: var(--border-hover); }
.ruleset-icon { width: 20px; height: 20px; flex-shrink: 0; color: var(--text-muted); display: flex; align-items: center; }
.ruleset-body { min-width: 0; }
.ruleset-name { font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ruleset-version { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); margin: 2px 0 var(--space-1); }
.ruleset-desc { font-size: var(--text-xs); color: var(--text-secondary); margin: 0; }
.side-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-4); }
.side-title { font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); margin-bottom: var(--space-3); }
.recruit-item { padding: var(--space-2) 0; border-top: 1px solid var(--border-default); cursor: pointer; }
.recruit-name { font-size: var(--text-sm); color: var(--text-primary); margin-bottom: 2px; transition: color var(--transition-fast); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.recruit-meta { font-size: var(--text-xs); color: var(--text-muted); }
.see-all-block { display: block; width: 100%; margin-top: var(--space-3); background: none; border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--space-2); font-size: var(--text-xs); color: var(--color-accent); cursor: pointer; text-align: center; }
.feed-list { display: flex; flex-direction: column; gap: var(--space-2); }
.feed-item { display: flex; flex-direction: column; gap: 4px; padding: var(--space-2) 0; border-top: 1px solid var(--border-default); }
.feed-item strong { color: var(--text-primary); font-size: var(--text-sm); }
.feed-item span { color: var(--text-secondary); font-size: var(--text-xs); }
.guide-list { display: flex; flex-direction: column; gap: var(--space-2); }
.guide-link { text-align: left; border: none; background: var(--surface-hover); color: var(--text-primary); padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); cursor: pointer; }
@media (max-width: 768px) {
  .content-layout { grid-template-columns: 1fr; }
  .side-col { display: none; }
  .quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ruleset-grid { grid-template-columns: repeat(2, 1fr); }
  .hero-title { font-size: var(--text-xl); }
}
@media (max-width: 480px) { .ruleset-grid { grid-template-columns: 1fr; } }
</style>