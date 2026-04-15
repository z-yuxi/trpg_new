<script setup lang="ts">
import { ref } from 'vue';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';

const myRulesets = ref([
  { id: '1', name: '自定义规则', version: '0.1', status: 'draft', updatedAt: '2026-04-10' },
]);
</script>

<template>
  <div class="my-assets-tab">
    <h3 class="sub-title">我的规则集</h3>
    <div class="asset-list">
      <TCard v-for="rs in myRulesets" :key="rs.id" padding="md">
        <div class="asset-row">
          <div>
            <div class="asset-name">{{ rs.name }}</div>
            <div class="asset-meta">
              <TTag :color="rs.status === 'published' ? 'success' : 'default'" size="sm">
                {{ rs.status === 'published' ? '已发布' : '草稿' }}
              </TTag>
              <span class="version">v{{ rs.version }}</span>
              <span class="updated">更新于 {{ rs.updatedAt }}</span>
            </div>
          </div>
          <div class="actions">
            <TButton type="secondary" size="sm">编辑</TButton>
            <TButton v-if="rs.status === 'draft'" type="primary" size="sm">发布</TButton>
          </div>
        </div>
      </TCard>
      <div v-if="myRulesets.length === 0" class="empty">暂无规则集，去创作者后台创建吧</div>
    </div>
  </div>
</template>

<style scoped>
.my-assets-tab { display: flex; flex-direction: column; gap: var(--space-4); }
.sub-title { font-size: var(--text-base); font-weight: 600; color: var(--color-text-primary); }
.asset-list { display: flex; flex-direction: column; gap: var(--space-3); }
.asset-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.asset-name { font-weight: 600; margin-bottom: var(--space-1); }
.asset-meta { display: flex; align-items: center; gap: var(--space-2); }
.version { font-size: var(--text-xs); color: var(--color-text-muted); font-family: var(--font-mono); }
.updated { font-size: var(--text-xs); color: var(--color-text-muted); }
.actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
.empty { color: var(--color-text-muted); font-size: var(--text-sm); text-align: center; padding: var(--space-6); }
</style>
