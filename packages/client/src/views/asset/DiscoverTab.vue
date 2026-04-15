<script setup lang="ts">
import { ref } from 'vue';
import TCard from '../../components/base/TCard.vue';
import TInput from '../../components/base/TInput.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';

const search = ref('');
const filterType = ref<'all' | 'ruleset' | 'module'>('all');

const rulesets = ref([
  { id: '1', name: '克苏鲁神话', version: '7.0', status: 'published', description: '经典恐怖TRPG规则集' },
  { id: '2', name: 'D&D 5e', version: '5.0', status: 'published', description: '龙与地下城第五版' },
  { id: '3', name: '自定义规则', version: '0.1', status: 'draft', description: '自制规则集草稿' },
]);

const filtered = () => rulesets.value.filter(r =>
  (filterType.value === 'all' || filterType.value === 'ruleset') &&
  r.name.includes(search.value)
);
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

    <div class="card-grid">
      <TCard v-for="rs in filtered()" :key="rs.id" padding="md" hoverable>
        <div class="asset-name">{{ rs.name }}</div>
        <div class="asset-meta">
          <TTag :color="rs.status === 'published' ? 'success' : 'default'" size="sm">
            {{ rs.status === 'published' ? '已发布' : '草稿' }}
          </TTag>
          <span class="version">v{{ rs.version }}</span>
        </div>
        <p class="asset-desc">{{ rs.description }}</p>
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
</style>
