<script setup lang="ts">
import TCard from '../components/base/TCard.vue';

// 创作者交易系统当前版本暂未实现
</script>

<template>
  <div class="creator-dash">
    <h1 class="page-title">创作者后台</h1>
    <TCard padding="lg" shadow>
      <div class="empty-state">
        <p class="empty-title">暂无数据</p>
        <p class="empty-desc">创作者收益与订单系统将在后续版本上线，敬请期待。</p>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.creator-dash { max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); }
.empty-state { text-align: center; padding: var(--space-8); }
.empty-title { font-size: var(--text-xl); font-weight: 600; color: var(--color-text-primary); margin-bottom: var(--space-2); }
.empty-desc { font-size: var(--text-sm); color: var(--color-text-muted); }
</style>
