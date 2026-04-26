<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const rulesetId = computed(() => String(route.params.id ?? ''));

function goWorkshop() {
  router.push('/creator/workshop');
}
</script>

<template>
  <div class="ruleset-detail-page">
    <div class="ruleset-detail-card">
      <h1>规则集详情</h1>
      <p>规则集 ID：{{ rulesetId }}</p>
      <p class="hint">该页面处于整理阶段，后续将接入完整规则集详情展示。</p>
      <button class="primary-btn" @click="goWorkshop">前往规则工坊</button>
    </div>
  </div>
</template>

<style scoped>
.ruleset-detail-page {
  min-height: calc(100vh - 56px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: var(--color-page-bg);
}

.ruleset-detail-card {
  width: min(560px, 100%);
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  display: grid;
  gap: var(--space-3);
}

h1 {
  margin: 0;
  font-size: var(--text-xl);
  color: var(--color-text-primary);
}

p {
  margin: 0;
  color: var(--color-text-secondary);
}

.hint {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}

.primary-btn {
  justify-self: start;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: #fff;
  padding: 8px 14px;
  cursor: pointer;
}
</style>
