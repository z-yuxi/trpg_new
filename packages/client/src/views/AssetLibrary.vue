<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TTag from '../components/base/TTag.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import { api } from '../utils/api';
import { useAuthStore } from '../stores/auth-store';

const router = useRouter();

/* ========== 类型 ========== */
interface Ruleset {
  id: string;
  name: string;
  version?: string;
  author?: string;
  author_id?: string;
  base_ruleset?: string;
  status?: string;
  description?: string;
}
interface Module {
  id: string;
  title?: string;
  name?: string;
  author?: string;
  cover_url?: string;
  difficulty?: string;
  min_players?: number;
  max_players?: number;
  style?: string;
  price?: number;
  rating?: number;
  download_count?: number;
  ruleset_name?: string;
}

/* ========== 状态 ========== */
const authStore = useAuthStore();

const activeTab = ref<'modules' | 'rulesets' | 'assets'>('modules');
const search = ref('');
const loading = ref(false);
const rulesets = ref<Ruleset[]>([]);
const modules = ref<Module[]>([]);
const myModules = ref<Module[]>([]);
const myRulesets = ref<Ruleset[]>([]);

/* 筛选条件 */
const filterRuleset  = ref('');
const filterTheme    = ref('');
const filterDifficulty = ref('');
const filterPlayers  = ref('');
const filterStyle    = ref('');
const filterSort     = ref('hot');

/* ========== 加载数据 ========== */
onMounted(async () => {
  loading.value = true;
  try {
    const [rsRes, modRes] = await Promise.allSettled([
      api.get<{ data: Ruleset[]; total: number }>('/rulesets?status=published&limit=50'),
      api.get<{ data: Module[]; total: number }>('/modules?limit=50'),
    ]);

    if (rsRes.status === 'fulfilled') rulesets.value = rsRes.value.data ?? [];
    if (modRes.status === 'fulfilled') modules.value = modRes.value.data ?? [];

    if (authStore.token) {
      const [mineModulesRes, mineRulesetsRes] = await Promise.allSettled([
        api.get<Module[]>('/modules/mine'),
        api.get<{ data: Ruleset[]; total: number }>(`/rulesets?author_id=${authStore.userId}&limit=50`),
      ]);
      if (mineModulesRes.status === 'fulfilled') myModules.value = mineModulesRes.value ?? [];
      if (mineRulesetsRes.status === 'fulfilled') myRulesets.value = mineRulesetsRes.value.data ?? [];
    }
  } finally {
    loading.value = false;
  }
});

/* ========== 本地过滤 ========== */
const filteredModules = computed(() => {
  let list = modules.value;
  const kw = search.value.trim().toLowerCase();
  if (kw) list = list.filter(m => (m.title ?? m.name ?? '').toLowerCase().includes(kw));
  if (filterRuleset.value)   list = list.filter(m => m.ruleset_name === filterRuleset.value);
  if (filterDifficulty.value) list = list.filter(m => m.difficulty === filterDifficulty.value);
  if (filterStyle.value)     list = list.filter(m => m.style === filterStyle.value);
  if (filterPlayers.value) {
    const n = parseInt(filterPlayers.value);
    list = list.filter(m => (!m.min_players || m.min_players <= n) && (!m.max_players || m.max_players >= n));
  }
  return list;
});

const filteredRulesets = computed(() => {
  let list = rulesets.value;
  const kw = search.value.trim().toLowerCase();
  if (kw) list = list.filter(r => r.name.toLowerCase().includes(kw));
  return list;
});

/* ========== 工具 ========== */
function playerRange(m: Module) {
  if (m.min_players && m.max_players) return `${m.min_players}~${m.max_players} 人`;
  if (m.min_players) return `≥${m.min_players} 人`;
  return '—';
}
function priceLabel(price?: number) {
  if (price === undefined || price === null) return '—';
  return price === 0 ? '免费' : `¥${price}`;
}
function ratingLabel(r?: number) {
  if (!r) return '—';
  return r.toFixed(1);
}
</script>

<template>
  <div class="plaza">
    <!-- 顶部标题 -->
    <div class="plaza-header">
      <h1 class="plaza-title">广场</h1>
      <p class="plaza-subtitle">发现模组和规则集，开启你的冒险</p>
    </div>

    <!-- 顶部二级 Tab -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'modules' }" @click="activeTab = 'modules'">
        模组集市
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'rulesets' }" @click="activeTab = 'rulesets'">
        规则集市
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'assets' }" @click="activeTab = 'assets'">
        我的资产
      </button>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <TInput v-model="search" placeholder="搜索..." style="width: 200px;" />
      <template v-if="activeTab === 'modules'">
        <select v-model="filterRuleset"   class="filter-select"><option value="">全部规则</option></select>
        <select v-model="filterTheme"     class="filter-select"><option value="">全部题材</option></select>
        <select v-model="filterDifficulty" class="filter-select">
          <option value="">全部难度</option>
          <option value="easy">入门</option>
          <option value="normal">标准</option>
          <option value="hard">困难</option>
        </select>
        <select v-model="filterPlayers" class="filter-select">
          <option value="">全部人数</option>
          <option value="2">2 人</option>
          <option value="3">3 人</option>
          <option value="4">4 人</option>
          <option value="5">5 人</option>
          <option value="6">6 人</option>
        </select>
        <select v-model="filterStyle" class="filter-select">
          <option value="">全部风格</option>
          <option value="horror">恐怖</option>
          <option value="mystery">推理</option>
          <option value="fantasy">奇幻</option>
          <option value="scifi">科幻</option>
        </select>
      </template>
      <select v-model="filterSort" class="filter-select">
        <option value="hot">热度</option>
        <option value="new">最新</option>
        <option value="rating">评分</option>
      </select>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="empty-state">加载中...</div>

    <!-- 模组集市 -->
    <template v-else-if="activeTab === 'modules'">
      <div v-if="filteredModules.length === 0" class="empty-state">
        <p>暂无模组</p>
        <p class="empty-hint">模组接口尚未开放，敬请期待</p>
      </div>
      <div v-else class="card-grid">
        <div v-for="m in filteredModules" :key="m.id" class="module-card">
          <!-- 封面 -->
          <div class="module-cover">
            <img v-if="m.cover_url" :src="m.cover_url" :alt="m.title ?? m.name" />
            <div v-else class="cover-placeholder">
              <span>{{ (m.title ?? m.name ?? '?')[0] }}</span>
            </div>
          </div>
          <!-- 信息 -->
          <div class="module-body">
            <div class="module-title">{{ m.title ?? m.name ?? '未命名' }}</div>
            <div class="module-meta">
              <span class="meta-item">{{ m.author ?? '佚名' }}</span>
              <TTag v-if="m.difficulty" size="sm" :color="m.difficulty === 'hard' ? 'danger' : m.difficulty === 'easy' ? 'success' : 'default'">
                {{ m.difficulty === 'easy' ? '入门' : m.difficulty === 'hard' ? '困难' : '标准' }}
              </TTag>
            </div>
            <div class="module-tags">
              <span class="meta-item">{{ playerRange(m) }}</span>
              <span v-if="m.style" class="meta-item">{{ m.style }}</span>
            </div>
            <div class="module-footer">
              <span class="module-price">{{ priceLabel(m.price) }}</span>
              <div class="module-stats">
                <span v-if="m.rating">★ {{ ratingLabel(m.rating) }}</span>
                <span v-if="m.download_count">↓ {{ m.download_count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 规则集市 -->
    <template v-else-if="activeTab === 'rulesets'">
      <div v-if="filteredRulesets.length === 0" class="empty-state">
        <p>暂无已发布规则集</p>
      </div>
      <div v-else class="card-grid">
        <div v-for="rs in filteredRulesets" :key="rs.id" class="ruleset-card">
          <div class="ruleset-header">
            <div class="ruleset-name">{{ rs.name }}</div>
            <TTag size="sm" :color="rs.status === 'published' ? 'success' : 'default'">
              {{ rs.status === 'published' ? '已发布' : rs.status ?? '草稿' }}
            </TTag>
          </div>
          <div class="ruleset-meta">
            <span class="meta-item">v{{ rs.version ?? '—' }}</span>
            <span class="meta-item">{{ rs.author ?? '佚名' }}</span>
          </div>
          <div v-if="rs.base_ruleset" class="ruleset-base">
            衍生自：{{ rs.base_ruleset }}
          </div>
          <p class="ruleset-desc">{{ rs.description || '暂无描述' }}</p>
          <TButton type="secondary" size="sm" style="margin-top: var(--space-3)" @click="router.push(`/ruleset/${rs.id}`)">查看详情</TButton>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="assets-section">
        <div class="asset-column">
          <div class="section-head">
            <h2>我的模组</h2>
            <span>{{ myModules.length }} 个</span>
          </div>
          <div v-if="myModules.length === 0" class="empty-state asset-empty">暂无模组资产</div>
          <div v-else class="asset-list">
            <div v-for="moduleItem in myModules" :key="moduleItem.id" class="asset-item">
              <div>
                <div class="asset-name">{{ moduleItem.title ?? moduleItem.name }}</div>
                <div class="asset-meta">{{ moduleItem.ruleset_name ?? '未绑定规则集' }} · {{ priceLabel(moduleItem.price) }}</div>
              </div>
              <TTag size="sm" :color="moduleItem.price === 0 ? 'success' : 'default'">{{ moduleItem.price === 0 ? '免费' : '已拥有' }}</TTag>
            </div>
          </div>
        </div>
        <div class="asset-column">
          <div class="section-head">
            <h2>我的规则集</h2>
            <span>{{ myRulesets.length }} 个</span>
          </div>
          <div v-if="myRulesets.length === 0" class="empty-state asset-empty">暂无已创建规则集</div>
          <div v-else class="asset-list">
            <div v-for="ruleset in myRulesets" :key="ruleset.id" class="asset-item">
              <div>
                <div class="asset-name">{{ ruleset.name }}</div>
                <div class="asset-meta">v{{ ruleset.version ?? '—' }} · {{ ruleset.status ?? 'draft' }}</div>
              </div>
              <TButton type="secondary" size="sm">查看</TButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.plaza {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

/* 头部 */
.plaza-header { }
.plaza-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
}
.plaza-subtitle { font-size: var(--text-sm); color: var(--text-secondary); margin-top: var(--space-1); }

/* Tab 栏 */
.tab-bar {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 0;
}
.tab-btn {
  padding: var(--space-2) var(--space-4);
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.tab-btn.active {
  color: var(--text-primary);
  border-bottom-color: var(--color-primary);
}
.tab-btn:hover:not(.active) { color: var(--text-body); }

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.filter-select {
  height: 36px;
  padding: 0 var(--space-3);
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-body);
  font-size: var(--text-sm);
  outline: none;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.filter-select:focus { border-color: var(--color-primary); }

/* 空状态 */
.empty-state {
  text-align: center;
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: var(--space-12);
}
.empty-hint { font-size: var(--text-xs); margin-top: var(--space-2); }

/* 4列响应式网格 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-4);
}
@media (max-width: 1024px) { .card-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px)  { .card-grid { grid-template-columns: 1fr; } }

/* ===== 模组卡片 ===== */
.module-card {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--transition-normal), transform var(--transition-normal);
  cursor: pointer;
}
.module-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--border-hover);
}

.module-cover {
  width: 100%;
  aspect-ratio: 16/9;
  background: var(--surface-hover);
  overflow: hidden;
}
.module-cover img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-muted);
}

.module-body { padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); }
.module-title { font-weight: var(--font-semibold); font-size: var(--text-sm); color: var(--text-primary); }
.module-meta { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.module-tags { display: flex; gap: var(--space-2); }
.module-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: var(--space-2);
}
.module-price { font-weight: var(--font-semibold); font-size: var(--text-sm); color: var(--text-primary); }
.module-stats { display: flex; gap: var(--space-2); font-size: var(--text-xs); color: var(--text-muted); }

.meta-item { font-size: var(--text-xs); color: var(--text-secondary); }

/* ===== 规则集卡片 ===== */
.ruleset-card {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  transition: box-shadow var(--transition-normal), transform var(--transition-normal);
  cursor: pointer;
}
.ruleset-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  border-color: var(--border-hover);
}
.ruleset-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
.ruleset-name { font-weight: var(--font-semibold); color: var(--text-primary); font-size: var(--text-sm); }
.ruleset-meta { display: flex; gap: var(--space-3); }
.ruleset-base { font-size: var(--text-xs); color: var(--text-secondary); }
.ruleset-desc { font-size: var(--text-xs); color: var(--text-secondary); line-height: var(--leading-relaxed); }

.assets-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.asset-column {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}
.section-head h2 {
  font-size: var(--text-lg);
  color: var(--text-primary);
}
.asset-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.asset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  background: var(--surface-elevated);
}
.asset-name {
  color: var(--text-primary);
  font-weight: var(--font-semibold);
}
.asset-meta {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  margin-top: var(--space-1);
}
.asset-empty {
  padding: var(--space-6);
}
@media (max-width: 900px) {
  .assets-section {
    grid-template-columns: 1fr;
  }
}
</style>
