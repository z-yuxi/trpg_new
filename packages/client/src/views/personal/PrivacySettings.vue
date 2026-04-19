<script setup lang="ts">
import TCard from '../../components/base/TCard.vue';
</script>

<template>
  <div class="settings-page">
    <TCard padding="lg" shadow>
      <h2 class="title">隐私设置</h2>
      <ul class="placeholder-list">
        <li>谁可以查看我的资料：全部用户 / 仅好友（占位）</li>
        <li>是否允许通过 UID 搜索到我（占位）</li>
        <li>是否公开我的跑团统计数据（占位）</li>
      </ul>
    </TCard>
  </div>
</template>

<style scoped>
.settings-page { max-width: 720px; margin: 0 auto; }
.title { margin: 0 0 var(--space-4); font-size: var(--text-xl); font-weight: 700; }
.placeholder-list { margin: 0; padding-left: 18px; color: var(--color-text-secondary); line-height: 1.8; }
</style>
