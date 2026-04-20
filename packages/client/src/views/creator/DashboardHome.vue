<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import TCard from '../../components/base/TCard.vue';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';
import { useAuthStore } from '../../stores/auth-store';

interface RulesetItem {
  id: string;
  name: string;
  version: string;
  status: string;
  fork_count?: number;
  created_at?: string;
}

interface ModuleItem {
  id: string;
  name: string;
  status: string;
  download_count?: number;
  rating?: number;
  updated_at?: string;
}

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const rulesets = ref<RulesetItem[]>([]);
const modules = ref<ModuleItem[]>([]);

const stats = computed(() => {
  const totalDownloads = modules.value.reduce((sum, item) => sum + Number(item.download_count ?? 0), 0);
  const ratedModules = modules.value.filter((item) => Number(item.rating ?? 0) > 0);
  const averageRating = ratedModules.length
    ? ratedModules.reduce((sum, item) => sum + Number(item.rating ?? 0), 0) / ratedModules.length
    : 0;

  return [
    { label: '我的规则集', value: rulesets.value.length, hint: '含草稿与已发布' },
    { label: '我的模组', value: modules.value.length, hint: '可继续编辑与提审' },
    { label: '总下载量', value: totalDownloads, hint: '来自已上架模组' },
    { label: '平均评分', value: averageRating ? averageRating.toFixed(1) : '-', hint: '仅统计已有评分模组' },
  ];
});

const recentEdits = computed(() => {
  return [
    ...rulesets.value.map((item) => ({
      id: `ruleset-${item.id}`,
      type: 'ruleset' as const,
      title: item.name,
      subtitle: `v${item.version}`,
      status: item.status,
      updated_at: item.created_at ?? '',
      action: () => router.push(`/creator/workshop/${item.id}/edit`),
    })),
    ...modules.value.map((item) => ({
      id: `module-${item.id}`,
      type: 'module' as const,
      title: item.name,
      subtitle: '模组',
      status: item.status,
      updated_at: item.updated_at ?? '',
      action: () => router.push(`/creator/modules`),
    })),
  ]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, 8);
});

async function loadDashboard() {
  loading.value = true;
  const headers = { Authorization: `Bearer ${authStore.token}` };
  try {
    const [rulesetRes, moduleRes] = await Promise.all([
      fetch('/api/rulesets/mine', { headers }),
      fetch('/api/modules/mine', { headers }),
    ]);

    if (rulesetRes.ok) {
      const payload = await rulesetRes.json();
      rulesets.value = Array.isArray(payload) ? payload : payload.data ?? [];
    }

    if (moduleRes.ok) {
      const payload = await moduleRes.json();
      modules.value = Array.isArray(payload) ? payload : payload.data ?? [];
    }
  } finally {
    loading.value = false;
  }
}

function formatStatus(status: string) {
  return {
    draft: '草稿',
    reviewing: '审核中',
    published: '已发布',
    deprecated: '已弃用',
    public: '已上架',
    public_notice: '公示期',
  }[status] ?? status;
}

onMounted(loadDashboard);
</script>

<template>
  <div class="dashboard-page">
    <section class="hero">
      <div>
        <h1>创作者仪表盘</h1>
        <p>集中查看规则集、模组与最近编辑动作，快速回到工作流。</p>
      </div>
      <div class="hero-actions">
        <TButton type="primary" @click="router.push('/creator/workshop')">进入规则工坊</TButton>
        <TButton type="secondary" @click="router.push('/creator/modules')">管理模组</TButton>
      </div>
    </section>

    <section class="stats-grid">
      <TCard v-for="item in stats" :key="item.label" padding="md" class="stat-card">
        <div class="stat-label">{{ item.label }}</div>
        <div class="stat-value">{{ item.value }}</div>
        <div class="stat-hint">{{ item.hint }}</div>
      </TCard>
    </section>

    <section class="panel-grid">
      <TCard padding="lg" class="panel-card">
        <div class="panel-head">
          <h2>最近编辑</h2>
          <TTag color="default" size="sm">规则集 + 模组</TTag>
        </div>
        <div v-if="loading" class="empty-state">正在汇总创作数据…</div>
        <div v-else-if="recentEdits.length === 0" class="empty-state">暂无最近编辑记录</div>
        <div v-else class="recent-list">
          <button v-for="item in recentEdits" :key="item.id" class="recent-item" @click="item.action()">
            <div class="recent-main">
              <span class="recent-type">{{ item.type === 'ruleset' ? '规则集' : '模组' }}</span>
              <strong class="recent-title">{{ item.title }}</strong>
              <span class="recent-subtitle">{{ item.subtitle }}</span>
            </div>
            <div class="recent-meta">
              <TTag :color="item.status === 'published' || item.status === 'public' ? 'success' : item.status === 'reviewing' ? 'warning' : 'default'" size="sm">
                {{ formatStatus(item.status) }}
              </TTag>
              <span>{{ item.updated_at ? new Date(item.updated_at).toLocaleString() : '刚创建' }}</span>
            </div>
          </button>
        </div>
      </TCard>

      <TCard padding="lg" class="panel-card quick-card">
        <div class="panel-head">
          <h2>快捷入口</h2>
        </div>
        <button class="quick-link" @click="router.push('/creator/workshop')">
          <strong>新建规则集</strong>
          <span>创建草稿并进入规则编辑器</span>
        </button>
        <button class="quick-link" @click="router.push('/creator/modules')">
          <strong>新建模组</strong>
          <span>进入我的模组页，创建或继续编辑</span>
        </button>
        <button class="quick-link" @click="router.push('/creator/workshop')">
          <strong>进入规则工坊</strong>
          <span>管理版本、发布状态和 Fork 来源</span>
        </button>
      </TCard>
    </section>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}
.hero h1 {
  margin: 0;
  font-size: 32px;
  color: var(--text-primary);
}
.hero p {
  margin: var(--space-2) 0 0;
  color: var(--text-secondary);
}
.hero-actions {
  display: flex;
  gap: var(--space-2);
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}
.stat-card { min-height: 136px; }
.stat-label { font-size: var(--text-sm); color: var(--text-muted); }
.stat-value { margin-top: var(--space-2); font-size: 36px; font-weight: 800; color: var(--text-primary); }
.stat-hint { margin-top: auto; font-size: var(--text-xs); color: var(--text-muted); }
.panel-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
  gap: var(--space-4);
}
.panel-card { min-height: 100%; }
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}
.panel-head h2 {
  margin: 0;
  font-size: var(--text-lg);
  color: var(--text-primary);
}
.recent-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-card);
  cursor: pointer;
}
.recent-item:hover { border-color: var(--color-accent); }
.recent-main { display: flex; flex-direction: column; gap: 4px; text-align: left; }
.recent-type { font-size: var(--text-xs); color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.recent-title { font-size: var(--text-base); font-weight: 700; color: var(--text-primary); }
.recent-subtitle { font-size: var(--text-sm); color: var(--text-secondary); }
.recent-meta { display: flex; flex-direction: column; gap: var(--space-2); align-items: flex-end; color: var(--text-muted); font-size: var(--text-xs); }
.quick-card { display: flex; flex-direction: column; gap: var(--space-3); }
.quick-link {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface-hover) 80%, transparent), transparent);
  cursor: pointer;
}
.quick-link strong { color: var(--text-primary); font-size: var(--text-base); }
.quick-link span { color: var(--text-secondary); font-size: var(--text-sm); line-height: 1.6; }
.empty-state { padding: var(--space-8); text-align: center; color: var(--text-muted); }

@media (max-width: 768px) {
  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-grid {
    grid-template-columns: 1fr;
  }

  .recent-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .recent-meta {
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
