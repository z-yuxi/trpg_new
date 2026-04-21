<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import TCard from '../../components/base/TCard.vue';
import TInput from '../../components/base/TInput.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';
import { api } from '../../utils/api';

const search = ref('');
const filterType = ref<'all' | 'ruleset' | 'module'>('all');
const rulesets = ref<any[]>([]);
const loading = ref(false);

const filtered = computed(() => rulesets.value.filter(r =>
  r.name.includes(search.value)
));

onMounted(async () => {
  loading.value = true;
  try {
    rulesets.value = await api.get<unknown[]>('/rulesets?status=published');
  } catch { /* ignore */ }
  finally { loading.value = false; }
});
</script>

<template>
  <div class="discover-tab">
    <div class="toolbar">
      <TInput v-model="search" placeholder="搜索规则集 / 模组..." style="flex:1" />
      <div class="filter-tabs">
        <button :class="{ active: filterType === 'all' }" @click="filterType = 'all'">全部</button>
        <button :class="{ active: filterType === 'ruleset' }" @click="filterType = 'ruleset'">规则集</button>
        <button :class="{ active: filterType === 'module' }" @click="filterType = 'module'">模组</button>
      </div>
    </div>
    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="filtered.length === 0" class="empty">暂无规则集</div>
    <div v-else class="card-grid">
      <TCard v-for="rs in filtered" :key="rs.id" padding="md" hoverable>
        <div class="asset-name">{{ rs.name }}</div>
        <div class="asset-meta">
          <TTag :color="rs.status === 'published' ? 'success' : 'default'" size="sm">
            {{ rs.status === 'published' ? '已发布' : '草稿' }}
          </TTag>
          <span class="version">v{{ rs.version }}</span>
        </div>
        <p class="asset-desc">{{ rs.description || '暂无描述' }}</p>
        <TButton type="ghost" size="sm" style="margin-top:8px">查看详情</TButton>
      </TCard>
    </div>
  </div>
</template>

<style scoped>
.discover-tab { display: flex; flex-direction: column; gap: var(--space-4); }
.toolbar { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.filter-tabs { display: flex; gap: var(--space-1); }
.filter-tabs button {
  padding: 4px 12px; border: 1px solid var(--color-card-border);
  border-radius: var(--radius-full); background: none; cursor: pointer;
  color: var(--color-text-secondary); font-size: var(--text-sm);
}
.filter-tabs button.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }
.asset-name { font-weight: 600; margin-bottom: var(--space-2); }
.asset-meta { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2); }
.version { font-size: var(--text-xs); color: var(--color-text-muted); font-family: var(--font-mono); }
.asset-desc { font-size: var(--text-sm); color: var(--color-text-secondary); }
.empty { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-6); }
</style>
