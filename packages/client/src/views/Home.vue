<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TTag from '../components/base/TTag.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import SvgIcon from '../components/SvgIcon.vue';
import { useAuthStore } from '../stores/auth-store';
import { api } from '../utils/api';

const authStore = useAuthStore();
const router = useRouter();

const campaigns = ref<any[]>([]);
const rulesets = ref<any[]>([]);
const modules = ref<any[]>([]);
const recruitments = ref<any[]>([]);
const loading = ref(false);

const quickActions = [
  { title: '找团', desc: '浏览招募并加入适合你的团', path: '/community/recruit' },
  { title: '做GM', desc: '创建团并开始组织你的队伍', path: '/campaigns' },
  { title: '发招募', desc: '快速发布你的跑团招募帖', path: '/community/recruit' },
  { title: '发求组', desc: '告诉大家你正在寻找什么团', path: '/community/recruit' },
];

const mixedRecommendations = computed(() => [
  ...modules.value.slice(0, 2).map((item) => ({ id: `m-${item.id}`, type: 'module', title: item.name, subtitle: item.ruleset_name || '模组', desc: item.description })),
  ...rulesets.value.slice(0, 2).map((item) => ({ id: `r-${item.id}`, type: 'ruleset', title: item.name, subtitle: `v${item.version ?? '1.0'}`, desc: item.description })),
  ...recruitments.value.slice(0, 2).map((item) => ({ id: `q-${item.id}`, type: 'recruitment', title: item.title ?? item.campaign_name, subtitle: '组队动态', desc: item.description ?? '新的招募动态' })),
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
    <section class="banner">
      <div class="banner-inner">
        <h1 class="banner-title">共叙，专注人与人之间的共同叙事</h1>
        <p class="banner-subtitle">在这里，与同好相聚，共同书写属于彼此的故事。</p>
        <div class="banner-actions">
          <button class="btn-primary" @click="router.push('/campaigns')">我的团</button>
          <button class="btn-secondary" @click="router.push('/community/recruit')">招募板</button>
        </div>
      </div>
    </section>

    <div class="content-layout">
      <div class="main-col">
        <section class="section" v-if="authStore.isLoggedIn">
          <div class="section-header">
            <h2 class="section-title">进行中的团</h2>
            <button class="see-all" @click="router.push('/campaigns')">查看全部 ›</button>
          </div>
          <div v-if="loading" class="campaign-scroll">
            <TSkeleton type="card" v-for="i in 3" :key="i" style="min-width:160px;flex-shrink:0" />
          </div>
          <div v-else-if="campaigns.length === 0" class="hint-text">
            暂无战役，<span class="link" @click="router.push('/campaigns')">去创建</span>
          </div>
          <div v-else class="campaign-scroll">
            <div v-for="c in campaigns" :key="c.id" class="campaign-card" @click="router.push(`/room/${c.id}`)">
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
            <h2 class="section-title">快速组队入口</h2>
          </div>
          <div class="quick-grid">
            <button v-for="item in quickActions" :key="item.title" class="quick-entry-card" @click="router.push(item.path)">
              <strong>{{ item.title }}</strong>
              <span>{{ item.desc }}</span>
            </button>
          </div>
        </section>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">为你推荐</h2>
            <button class="see-all" @click="router.push('/assets')">查看广场 ›</button>
          </div>
          <div v-if="loading" class="ruleset-grid">
            <TSkeleton type="card" v-for="i in 6" :key="i" />
          </div>
          <div v-else-if="mixedRecommendations.length === 0" class="hint-text">暂无推荐内容</div>
          <div v-else class="ruleset-grid">
            <div v-for="item in mixedRecommendations" :key="item.id" class="ruleset-card" @click="router.push(item.type === 'recruitment' ? '/community/recruit' : '/assets')">
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
          <div v-for="r in recruitments" :key="r.id" class="recruit-item" @click="router.push(`/community/${r.id}`)">
            <div class="recruit-name">{{ r.title ?? r.campaign_name }}</div>
            <div class="recruit-meta">{{ r.current_players ?? 0 }}/{{ r.max_players ?? '?' }} 人</div>
          </div>
          <button class="see-all-block" @click="router.push('/community/recruit')">查看全部招募 ›</button>
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
  </div>
</template>

<style scoped>
.home-page { max-width: 1100px; margin: 0 auto; padding: 0 var(--space-4) var(--space-8); }
.banner {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
  border-radius: var(--radius-lg);
  padding: var(--space-8) var(--space-6);
  margin-bottom: var(--space-6);
}
.banner-title { font-size: 32px; font-weight: 800; margin: 0 0 var(--space-2); color: var(--text-inverse); }
.banner-subtitle { font-size: var(--text-base); color: rgba(255, 255, 255, 0.85); margin: 0 0 var(--space-5); }
.banner-actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.btn-primary {
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  font-weight: 700;
  font-size: var(--text-sm);
  cursor: pointer;
}
.btn-primary:hover { background: var(--btn-primary-hover); }
.btn-secondary {
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-md);
  border: 1px solid var(--btn-secondary-border);
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  font-size: var(--text-sm);
  cursor: pointer;
}
.content-layout { display: grid; grid-template-columns: 1fr 280px; gap: var(--space-6); align-items: start; }
.main-col { min-width: 0; }
.side-col { display: flex; flex-direction: column; gap: var(--space-4); }
.section { margin-bottom: var(--space-7); }
.quick-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
.quick-entry-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  text-align: left;
  padding: var(--space-5);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-card);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.quick-entry-card:hover { border-color: var(--border-hover); box-shadow: var(--shadow-md); }
.quick-entry-card strong { color: var(--text-primary); }
.quick-entry-card span { color: var(--text-secondary); font-size: var(--text-sm); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-title { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin: 0; }
.see-all { background: none; border: none; color: var(--color-accent); font-size: var(--text-sm); cursor: pointer; }
.hint-text { font-size: var(--text-sm); color: var(--text-muted); padding: var(--space-3) 0; }
.link { color: var(--color-accent); cursor: pointer; }
.campaign-scroll { display: flex; gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-2); scrollbar-width: none; }
.campaign-scroll::-webkit-scrollbar { display: none; }
.campaign-card { min-width: 180px; background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); overflow: hidden; cursor: pointer; flex-shrink: 0; transition: border-color var(--transition-fast); }
.campaign-card:hover { border-color: var(--border-hover); }
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
  .banner-title { font-size: var(--text-2xl); }
}
@media (max-width: 480px) { .ruleset-grid { grid-template-columns: 1fr; } }
</style>