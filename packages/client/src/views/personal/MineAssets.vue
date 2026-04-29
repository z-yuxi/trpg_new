<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '../../components/base/EmptyState.vue';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';
import TSkeleton from '../../components/base/TSkeleton.vue';
import QuickCreateCampaignDialog from '../../components/campaign/QuickCreateCampaignDialog.vue';
import { api } from '../../utils/api';
import { useAuthStore } from '../../stores/auth-store';

interface Module {
  id: string;
  title?: string;
  name?: string;
  ruleset_name?: string;
  price?: number;
  cover_url?: string;
}
interface Ruleset {
  id: string;
  name: string;
  version?: string;
  status?: string;
  description?: string;
}

const authStore = useAuthStore();
const router = useRouter();

const loading = ref(false);
const myModules = ref<Module[]>([]);
const myRulesets = ref<Ruleset[]>([]);

const showQuickCreate = ref(false);
const quickCreatePrefill = ref<{ moduleId: string | null; rulesetId: string | null }>({ moduleId: null, rulesetId: null });

function openQuickCreate(moduleId?: string | null, rulesetId?: string | null) {
  if (!authStore.isLoggedIn) { router.push('/login'); return; }
  quickCreatePrefill.value = { moduleId: moduleId ?? null, rulesetId: rulesetId ?? null };
  showQuickCreate.value = true;
}

function handleCampaignCreated(payload: { campaignId: string; recruitmentPostId: string | null }) {
  if (payload.recruitmentPostId) {
    router.push(`/recruit/${payload.recruitmentPostId}`);
  } else {
    router.push(`/room/${payload.campaignId}`);
  }
}

onMounted(async () => {
  if (!authStore.isLoggedIn) return;
  loading.value = true;
  try {
    const [modRes, rsRes] = await Promise.allSettled([
      api.get<Module[]>('/modules/mine'),
      api.get<{ data?: Ruleset[] } | Ruleset[]>(`/rulesets?author_id=${authStore.userId}&limit=50`),
    ]);
    if (modRes.status === 'fulfilled') myModules.value = modRes.value ?? [];
    if (rsRes.status === 'fulfilled') {
      const d = rsRes.value;
      myRulesets.value = Array.isArray(d) ? d : (d as { data?: Ruleset[] }).data ?? [];
    }
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="mine-assets">
    <div class="page-header">
      <h1 class="page-title">资产</h1>
      <p class="page-subtitle">已获取的模组与规则包，可直接创建房间开始跑团</p>
    </div>

    <div v-if="!authStore.isLoggedIn" class="not-login">
      <EmptyState icon-name="" illustration-name="illust-empty" title="请先登录" description="登录后可查看已获取的内容" action-text="去登录" @action="router.push('/login')" />
    </div>

    <template v-else>
      <!-- 已获取模组 -->
      <section class="asset-section">
        <div class="section-head">
          <h2 class="section-title">模组</h2>
          <span class="section-count">{{ myModules.length }} 个</span>
        </div>

        <div v-if="loading" class="asset-grid">
          <TSkeleton v-for="i in 3" :key="i" type="card" />
        </div>
        <EmptyState
          v-else-if="myModules.length === 0"
          icon-name=""
          illustration-name="illust-empty"
          title="暂无模组"
          description="前往探索获取感兴趣的模组"
          action-text="去探索"
          @action="router.push('/explore')"
        />
        <div v-else class="asset-grid">
          <div v-for="m in myModules" :key="m.id" class="asset-card">
            <div class="asset-cover">
              <img v-if="m.cover_url" :src="m.cover_url" :alt="m.title ?? m.name" />
              <div v-else class="cover-placeholder">{{ (m.title ?? m.name ?? '?')[0] }}</div>
            </div>
            <div class="asset-body">
              <div class="asset-name">{{ m.title ?? m.name ?? '未命名' }}</div>
              <div class="asset-meta">{{ m.ruleset_name ?? '未绑定规则集' }}</div>
              <TTag size="sm" :color="m.price === 0 ? 'success' : 'default'">
                {{ m.price === 0 ? '免费' : '已拥有' }}
              </TTag>
              <TButton type="primary" size="sm" class="create-btn" @click="openQuickCreate(m.id, null)">
                创建房间
              </TButton>
            </div>
          </div>
        </div>
      </section>

      <!-- 已创建规则包 -->
      <section class="asset-section">
        <div class="section-head">
          <h2 class="section-title">规则包</h2>
          <span class="section-count">{{ myRulesets.length }} 个</span>
        </div>

        <div v-if="loading" class="asset-grid">
          <TSkeleton v-for="i in 2" :key="i" type="card" />
        </div>
        <EmptyState
          v-else-if="myRulesets.length === 0"
          icon-name=""
          illustration-name="illust-empty"
          title="暂无规则包"
          description="前往探索浏览规则包，或进入创作台创建"
          action-text="去探索"
          @action="router.push('/explore')"
        />
        <div v-else class="asset-grid">
          <div v-for="rs in myRulesets" :key="rs.id" class="asset-card ruleset">
            <div class="asset-body">
              <div class="asset-name">{{ rs.name }}</div>
              <div class="asset-meta">v{{ rs.version ?? '—' }}</div>
              <TTag size="sm" :color="rs.status === 'published' ? 'success' : 'default'">
                {{ rs.status === 'published' ? '已发布' : '草稿' }}
              </TTag>
              <p class="asset-desc">{{ rs.description || '暂无描述' }}</p>
              <TButton type="primary" size="sm" class="create-btn" @click="openQuickCreate(null, rs.id)">
                创建房间
              </TButton>
            </div>
          </div>
        </div>
      </section>
    </template>

    <QuickCreateCampaignDialog
      v-model:visible="showQuickCreate"
      :prefill-module-id="quickCreatePrefill.moduleId"
      :prefill-ruleset-id="quickCreatePrefill.rulesetId"
      @created="handleCampaignCreated"
    />
  </div>
</template>

<style scoped>
.mine-assets { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6); }
.page-header { }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); }
.page-subtitle { font-size: var(--text-sm); color: var(--color-text-muted); margin-top: var(--space-1); }

.asset-section { display: flex; flex-direction: column; gap: var(--space-4); }
.section-head { display: flex; align-items: center; gap: var(--space-2); }
.section-title { font-size: var(--text-lg); font-weight: 600; color: var(--color-text-primary); }
.section-count { font-size: var(--text-sm); color: var(--color-text-muted); }

.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }

.asset-card {
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.asset-card.ruleset { padding: var(--space-4); }
.asset-cover { height: 120px; background: var(--color-surface-2, #f0f0f0); overflow: hidden; }
.asset-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 2.5rem; color: var(--color-text-muted); background: var(--color-surface-2, #eee);
}
.asset-body { padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); flex: 1; }
.asset-card.ruleset .asset-body { padding: 0; }
.asset-name { font-weight: 600; font-size: var(--text-sm); color: var(--color-text-primary); }
.asset-meta { font-size: var(--text-xs); color: var(--color-text-muted); }
.asset-desc { font-size: var(--text-xs); color: var(--color-text-secondary); margin: 0; }
.create-btn { margin-top: auto; }
</style>
