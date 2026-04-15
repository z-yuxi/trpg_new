<script setup lang="ts">
import { ref } from 'vue';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';

const filterStatus = ref<'all' | 'open' | 'full'>('all');

const posts = ref([
  { id: '1', title: '招募3名调查员', poster: '星际迷途', ruleset: '克苏鲁神话', maxPlayers: 4, status: 'open', time: '2小时前' },
  { id: '2', title: '探索黑暗幻想世界', poster: '深海孤影', ruleset: 'D&D 5e', maxPlayers: 5, status: 'full', time: '1天前' },
]);

const statusMap = { open: { label: '招募中', color: 'success' as const }, closed: { label: '已关闭', color: 'default' as const }, full: { label: '已满员', color: 'danger' as const } };

const filtered = () => posts.value.filter(p => filterStatus.value === 'all' || p.status === filterStatus.value);
</script>

<template>
  <div class="board">
    <div class="filter-bar">
      <button :class="{ active: filterStatus === 'all' }" @click="filterStatus = 'all'">全部</button>
      <button :class="{ active: filterStatus === 'open' }" @click="filterStatus = 'open'">招募中</button>
      <button :class="{ active: filterStatus === 'full' }" @click="filterStatus = 'full'">已满员</button>
    </div>
    <div class="post-list">
      <TCard v-for="p in filtered()" :key="p.id" padding="md" hoverable>
        <div class="post-title">{{ p.title }}</div>
        <div class="post-meta">
          <TTag :color="statusMap[p.status as keyof typeof statusMap]?.color" size="sm">
            {{ statusMap[p.status as keyof typeof statusMap]?.label }}
          </TTag>
          <span class="ruleset">{{ p.ruleset }}</span>
          <span class="players">{{ p.maxPlayers }}人</span>
        </div>
        <div class="post-footer">
          <span class="poster">{{ p.poster }}</span>
          <span class="time">{{ p.time }}</span>
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
</style>
