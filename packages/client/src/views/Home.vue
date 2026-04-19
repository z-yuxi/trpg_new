<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TTag from '../components/base/TTag.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import { useAuthStore } from '../stores/auth-store';

const authStore = useAuthStore();
const router = useRouter();

const campaigns = ref<any[]>([]);
const rulesets = ref<any[]>([]);
const recruitments = ref<any[]>([]);
const loading = ref(false);

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'danger' }> = {
  running: { label: '进行中', color: 'success' },
  preparing: { label: '准备中', color: 'warning' },
  paused: { label: '已暂停', color: 'default' },
  ended: { label: '已结束', color: 'danger' },
};

onMounted(async () => {
  loading.value = true;
  try {
    const headers = authStore.token ? { Authorization: `Bearer ${authStore.token}` } : {};
    const [cRes, rRes, recRes] = await Promise.all([
      authStore.isLoggedIn ? fetch('/api/campaigns', { headers }) : Promise.resolve(null),
      fetch('/api/rulesets'),
      fetch('/api/recruitment?limit=5'),
    ]);
    if (cRes?.ok) { const d = await cRes.json(); campaigns.value = Array.isArray(d) ? d.slice(0, 6) : []; }
    if (rRes?.ok) { const d = await rRes.json(); rulesets.value = Array.isArray(d) ? d.slice(0, 6) : []; }
    if (recRes?.ok) { const d = await recRes.json(); recruitments.value = Array.isArray(d) ? d.slice(0, 5) : []; }
  } catch { /* silent */ } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="home-page">
    <section class="banner">
      <div class="banner-inner">
        <h1 class="banner-title">开始冒险</h1>
        <p class="banner-sub">与志同道合的玩家共同探索桌游世界</p>
        <div class="banner-actions">
          <button class="btn-primary" @click="router.push('/campaigns')">我的战役</button>
          <button class="btn-ghost" @click="router.push('/community/recruit')">组团招募</button>
        </div>
      </div>
    </section>

    <div class="content-layout">
      <div class="main-col">
        <section class="section" v-if="authStore.isLoggedIn">
          <div class="section-header">
            <h2 class="section-title">进行中的战役</h2>
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
              <div class="campaign-cover">{{ c.name?.charAt(0) }}</div>
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
            <h3>加入战役，开始冒险</h3>
            <p>登录后可以创建或参与跑团战役</p>
            <button class="btn-accent" @click="router.push('/login')">立即登录</button>
          </div>
        </section>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">为你推荐</h2>
            <button class="see-all" @click="router.push('/assets')">查看广场 ›</button>
          </div>
          <div v-if="rulesets.length === 0" class="hint-text">暂无规则集数据</div>
          <div v-else class="ruleset-grid">
            <div v-for="rs in rulesets" :key="rs.id" class="ruleset-card" @click="router.push('/assets')">
              <div class="ruleset-icon">📘</div>
              <div class="ruleset-body">
                <div class="ruleset-name">{{ rs.name }}</div>
                <div class="ruleset-version">v{{ rs.version ?? '1.0' }}</div>
                <p class="ruleset-desc">{{ rs.description || '暂无简介' }}</p>
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
          <div class="hint-text">暂无动态</div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.home-page { max-width: 1100px; margin: 0 auto; padding: 0 var(--space-4) var(--space-8); }
.banner { background: linear-gradient(135deg, var(--color-accent) 0%, color-mix(in srgb, var(--color-accent) 60%, #7c3aed) 100%); border-radius: var(--radius-lg); padding: var(--space-8) var(--space-6); margin-bottom: var(--space-6); color: #fff; }
.banner-title { font-size: 32px; font-weight: 800; margin: 0 0 var(--space-2); }
.banner-sub { font-size: var(--text-base); opacity: 0.88; margin: 0 0 var(--space-5); }
.banner-actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.btn-primary { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); border: none; background: #fff; color: var(--color-accent); font-weight: 700; font-size: var(--text-sm); cursor: pointer; }
.btn-ghost { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); border: 2px solid rgba(255,255,255,0.6); background: none; color: #fff; font-size: var(--text-sm); cursor: pointer; }
.content-layout { display: grid; grid-template-columns: 1fr 280px; gap: var(--space-6); align-items: start; }
.main-col { min-width: 0; }
.side-col { display: flex; flex-direction: column; gap: var(--space-4); }
.section { margin-bottom: var(--space-7); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-3); }
.section-title { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin: 0; }
.see-all { background: none; border: none; color: var(--color-accent); font-size: var(--text-sm); cursor: pointer; }
.hint-text { font-size: var(--text-sm); color: var(--text-muted); padding: var(--space-3) 0; }
.link { color: var(--color-accent); cursor: pointer; }
.campaign-scroll { display: flex; gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-2); scrollbar-width: none; }
.campaign-scroll::-webkit-scrollbar { display: none; }
.campaign-card { min-width: 180px; background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); overflow: hidden; cursor: pointer; flex-shrink: 0; transition: transform var(--transition-fast); }
.campaign-card:hover { transform: translateY(-2px); }
.campaign-cover { height: 80px; background: linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 50%, #7c3aed)); display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; color: rgba(255,255,255,0.7); }
.campaign-info { padding: var(--space-3); }
.campaign-name { font-weight: 600; font-size: var(--text-sm); color: var(--text-primary); margin-bottom: var(--space-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.campaign-meta { display: flex; align-items: center; gap: var(--space-2); }
.mono-sm { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); }
.cta-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-6); text-align: center; }
.cta-card h3 { font-size: var(--text-lg); font-weight: 700; color: var(--text-primary); margin: 0 0 var(--space-2); }
.cta-card p { font-size: var(--text-sm); color: var(--text-secondary); margin: 0 0 var(--space-4); }
.btn-accent { padding: var(--space-2) var(--space-5); border-radius: var(--radius-md); border: none; background: var(--color-accent); color: #fff; font-weight: 700; font-size: var(--text-sm); cursor: pointer; }
.ruleset-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); }
.ruleset-card { background: var(--surface-card); border: 1px solid var(--border-default); border-radius: var(--radius-lg); padding: var(--space-4); cursor: pointer; transition: border-color var(--transition-fast); display: flex; gap: var(--space-3); }
.ruleset-card:hover { border-color: var(--color-accent); }
.ruleset-icon { font-size: 24px; flex-shrink: 0; }
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
@media (max-width: 768px) {
  .content-layout { grid-template-columns: 1fr; }
  .side-col { display: none; }
  .ruleset-grid { grid-template-columns: repeat(2, 1fr); }
  .banner-title { font-size: var(--text-2xl); }
}
@media (max-width: 480px) { .ruleset-grid { grid-template-columns: 1fr; } }
</style>