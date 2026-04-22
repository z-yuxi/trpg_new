<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { api } from '../../utils/api';

interface Ruleset {
  id: string;
  name: string;
  version: string;
  status: 'draft' | 'reviewing' | 'published' | 'deprecated';
  fork_count: number;
  created_at: string;
  updated_at?: string;
}

interface Module {
  id: string;
  name: string;
  status: string;
  download_count: number;
  rating: number;
  updated_at: string;
}

type ProductItem =
  | ({ kind: 'ruleset' } & Ruleset)
  | ({ kind: 'module' } & Module);

const router = useRouter();

const rulesets = ref<Ruleset[]>([]);
const modules = ref<Module[]>([]);
const loading = ref(false);
const filterStatus = ref('all');
const searchQuery = ref('');

// 合并展示列表
const allProducts = computed<ProductItem[]>(() => [
  ...rulesets.value.map(r => ({ kind: 'ruleset' as const, ...r })),
  ...modules.value.map(m => ({ kind: 'module' as const, ...m })),
].sort((a, b) => {
  const ta = new Date(('updated_at' in a ? a.updated_at : undefined) ?? ('created_at' in a ? a.created_at : undefined) ?? 0).getTime();
  const tb = new Date(('updated_at' in b ? b.updated_at : undefined) ?? ('created_at' in b ? b.created_at : undefined) ?? 0).getTime();
  return tb - ta;
}));

const filteredProducts = computed(() => {
  let items = allProducts.value;
  if (filterStatus.value !== 'all') {
    items = items.filter(p => p.status === filterStatus.value);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    items = items.filter(p => p.name.toLowerCase().includes(q));
  }
  return items;
});

// 统计
const stats = computed(() => ({
  total: allProducts.value.length,
  published: allProducts.value.filter(p => p.status === 'published').length,
  downloads: modules.value.reduce((s, m) => s + (m.download_count ?? 0), 0),
  forks: rulesets.value.reduce((s, r) => s + (r.fork_count ?? 0), 0),
}));

async function loadProducts() {
  loading.value = true;
  try {
    const [rsData, modData] = await Promise.all([
      api.get<unknown>('/rulesets/mine'),
      api.get<unknown>('/modules/mine'),
    ]);
    // /rulesets/mine 可能返回数组或 { data: [] } 两种格式
    const rs = Array.isArray(rsData) ? rsData : ((rsData as any)?.data ?? []);
    const mods = Array.isArray(modData) ? modData : ((modData as any)?.data ?? []);
    rulesets.value = rs as Ruleset[];
    modules.value = mods as Module[];
  } catch {
    ElMessage.error('加载作品列表失败');
  } finally {
    loading.value = false;
  }
}

function formatStatus(status: string) {
  return { draft: '草稿', reviewing: '审核中', published: '已发布', deprecated: '已弃用', archived: '已归档' }[status] ?? status;
}

function statusColor(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'published') return 'success';
  if (status === 'reviewing') return 'warning';
  if (status === 'deprecated' || status === 'archived') return 'danger';
  return 'default';
}

function editProduct(item: ProductItem) {
  if (item.kind === 'ruleset') {
    router.push(`/creator/workshop/${item.id}/edit`);
  } else {
    router.push(`/creator/modules/${item.id}/edit`);
  }
}

function formatDate(str?: string) {
  if (!str) return '-';
  return new Date(str).toLocaleDateString('zh-CN');
}

const filterOptions = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'reviewing', label: '审核中' },
  { key: 'published', label: '已发布' },
  { key: 'deprecated', label: '已弃用' },
];

onMounted(loadProducts);
</script>

<template>
  <div class="products-page" v-loading="loading">
    <!-- 页头 -->
    <div class="page-header">
      <div>
        <h1 class="page-title">我的作品</h1>
        <p class="page-desc">管理你发布的规则包和模组</p>
      </div>
      <div class="header-actions">
        <TButton type="secondary" @click="router.push('/creator/workshop')">新建规则包</TButton>
        <TButton type="primary" @click="router.push('/creator/modules')">新建模组</TButton>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">作品总数</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.published }}</span>
        <span class="stat-label">已发布</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.downloads }}</span>
        <span class="stat-label">总下载量</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ stats.forks }}</span>
        <span class="stat-label">总派生数</span>
      </div>
    </div>

    <!-- 搜索 + 过滤 -->
    <div class="toolbar">
      <div class="filter-bar mobile-scroll-tabs">
        <button
          v-for="opt in filterOptions"
          :key="opt.key"
          class="filter-pill"
          :class="{ active: filterStatus === opt.key }"
          @click="filterStatus = opt.key"
        >
          {{ opt.label }}
        </button>
      </div>
      <input v-model="searchQuery" class="search-input" placeholder="搜索作品名称…" />
    </div>

    <!-- 作品列表 -->
    <div v-if="filteredProducts.length" class="products-grid">
      <article v-for="item in filteredProducts" :key="item.kind + item.id" class="product-card">
        <div class="card-top">
          <div class="product-icon">
            <SvgIcon :name="item.kind === 'ruleset' ? 'icon-book' : 'icon-grid'" :size="20" />
          </div>
          <div class="product-main">
            <h2 class="product-name">{{ item.name }}</h2>
            <span class="product-type">{{ item.kind === 'ruleset' ? '规则包' : '模组' }}</span>
            <span v-if="item.kind === 'ruleset'" class="product-version">v{{ (item as Ruleset).version }}</span>
          </div>
          <TTag :color="statusColor(item.status)">{{ formatStatus(item.status) }}</TTag>
        </div>

        <div class="meta-row">
          <template v-if="item.kind === 'module'">
            <span>下载 {{ (item as Module).download_count ?? 0 }}</span>
            <span v-if="(item as Module).rating">· ⭐ {{ (item as Module).rating.toFixed(1) }}</span>
          </template>
          <template v-else>
            <span>派生 {{ (item as Ruleset).fork_count ?? 0 }}</span>
          </template>
          <span>· 更新于 {{ formatDate(('updated_at' in item ? item.updated_at : undefined) ?? ('created_at' in item ? item.created_at : undefined)) }}</span>
        </div>

        <div class="card-actions">
          <TButton size="sm" type="secondary" @click="editProduct(item)">
            <SvgIcon name="icon-edit" :size="14" />
            编辑
          </TButton>
        </div>
      </article>
    </div>

    <div v-else-if="!loading" class="empty-state">
      <p class="empty-icon">📦</p>
      <p class="empty-title">暂无作品</p>
      <p class="empty-desc">创建你的第一个规则包或模组，并发布给更多玩家</p>
    </div>
  </div>
</template>

<style scoped>
.products-page { padding: var(--space-4); max-width: 960px; }

.page-header {
  display: flex; align-items: flex-start; gap: var(--space-4);
  margin-bottom: var(--space-5);
}
.page-title { font-size: var(--text-lg); font-weight: 700; margin: 0 0 var(--space-1); color: var(--text-primary); }
.page-desc { font-size: var(--text-sm); color: var(--text-muted); margin: 0; }
.page-header > div:first-child { flex: 1; }
.header-actions { display: flex; gap: var(--space-2); align-items: center; flex-shrink: 0; }

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-5);
}
.stat-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--surface-card);
  padding: var(--space-3) var(--space-4);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); line-height: 1; }
.stat-label { font-size: var(--text-xs); color: var(--text-muted); }

.toolbar { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-4); }
.filter-bar { display: flex; gap: var(--space-2); flex: 1; }
.mobile-scroll-tabs { overflow-x: auto; flex-wrap: nowrap; }
.filter-pill {
  padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border-default);
  background: none; cursor: pointer; font-size: var(--text-sm); white-space: nowrap;
  color: var(--text-secondary); transition: all var(--transition-fast);
}
.filter-pill.active {
  background: color-mix(in srgb, var(--color-primary, #2563eb) 10%, transparent);
  border-color: var(--color-primary, #2563eb);
  color: var(--color-primary, #2563eb);
  font-weight: 600;
}
.search-input {
  flex-shrink: 0; width: 180px; padding: 6px 12px;
  border: 1px solid var(--border-default); border-radius: var(--radius-md);
  background: var(--surface-card); font-size: var(--text-sm);
  color: var(--text-primary);
}
.search-input:focus { outline: none; border-color: var(--color-primary, #2563eb); }

.products-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.product-card {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--surface-card);
  padding: var(--space-4);
  display: flex; flex-direction: column; gap: var(--space-3);
}

.card-top { display: flex; align-items: flex-start; gap: var(--space-3); }
.product-icon {
  width: 40px; height: 40px; border-radius: var(--radius-lg);
  background: var(--surface-hover); display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; color: var(--text-secondary);
}
.product-main { flex: 1; min-width: 0; }
.product-name { font-size: var(--text-base); font-weight: 600; margin: 0 0 4px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.product-type { font-size: var(--text-xs); color: var(--text-muted); margin-right: var(--space-2); }
.product-version { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); }

.meta-row { font-size: var(--text-xs); color: var(--text-muted); display: flex; gap: 4px; flex-wrap: wrap; }
.card-actions { display: flex; gap: var(--space-2); }

.empty-state {
  text-align: center; padding: var(--space-16) var(--space-10);
  border: 2px dashed var(--border-default); border-radius: var(--radius-xl);
}
.empty-icon { font-size: 48px; margin: 0 0 var(--space-3); }
.empty-title { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin: 0 0 var(--space-2); }
.empty-desc { font-size: var(--text-sm); color: var(--text-muted); margin: 0; }

@media (max-width: 768px) {
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .products-grid { grid-template-columns: 1fr; }
  .toolbar { flex-wrap: wrap; }
  .search-input { width: 100%; }
  .page-header { flex-wrap: wrap; }
}
</style>
