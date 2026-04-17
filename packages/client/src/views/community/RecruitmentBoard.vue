<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';

const filterStatus = ref<'all' | 'open' | 'full'>('all');
const posts = ref<any[]>([]);
const loading = ref(false);

const filtered = computed(() =>
  posts.value.filter(p => filterStatus.value === 'all' || p.status === filterStatus.value)
);

const statusMap: Record<string, { label: string; color: 'success' | 'default' | 'danger' }> = {
  open: { label: '招募中', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
  full: { label: '已满员', color: 'danger' },
};

onMounted(async () => {
  loading.value = true;
  try {
    const res = await fetch('/api/recruitment');
    if (res.ok) {
      const data = await res.json();
      posts.value = data.data ?? data;
    }
  } catch { /* ignore */ }
  finally { loading.value = false; }
});
</script>

<template>
  <div class="board">
    <div class="filter-bar">
      <button :class="{ active: filterStatus === 'all' }" @click="filterStatus = 'all'">全部</button>
      <button :class="{ active: filterStatus === 'open' }" @click="filterStatus = 'open'">招募中</button>
      <button :class="{ active: filterStatus === 'full' }" @click="filterStatus = 'full'">已满员</button>
    </div>
    <div v-if="loading" class="empty">加载中...</div>
    <div v-else-if="filtered.length === 0" class="empty">暂无招募帖</div>
    <div v-else class="post-list">
      <TCard v-for="p in filtered" :key="p.id" padding="md" hoverable>
        <div class="post-title">{{ p.title }}</div>
        <div class="post-meta">
          <TTag :color="statusMap[p.status]?.color" size="sm">
            {{ statusMap[p.status]?.label }}
          </TTag>
          <span class="ruleset">{{ p.ruleset_id }}</span>
          <span class="players">{{ p.player_count_max }}人</span>
        </div>
        <div class="post-footer">
          <span class="poster">{{ p.poster_id }}</span>
        </div>
      </TCard>
    </div>
  </div>
</template>

<style scoped>
.board { display: flex; flex-direction: column; gap: var(--space-4); }
.filter-bar { display: flex; gap: var(--space-2); }
.filter-bar button {
  padding: 4px 12px; border: 1px solid var(--color-card-border);
  border-radius: var(--radius-full); background: none; cursor: pointer;
  font-size: var(--text-sm); color: var(--color-text-secondary);
}
.filter-bar button.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.post-list { display: flex; flex-direction: column; gap: var(--space-3); }
.post-title { font-weight: 600; margin-bottom: var(--space-2); }
.post-meta { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); }
.ruleset { font-size: var(--text-xs); color: var(--color-text-secondary); }
.players { font-size: var(--text-xs); color: var(--color-text-muted); }
.post-footer { display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--color-text-muted); }
.empty { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-6); }
</style>
