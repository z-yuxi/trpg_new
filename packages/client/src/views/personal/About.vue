<script setup lang="ts">
import TCard from '../../components/base/TCard.vue';

const version = '0.1.0';
</script>

<template>
  <div class="settings-page">
    <TCard padding="lg" shadow>
      <h2 class="title">关于我们</h2>
      <p class="desc">TRPG 协作跑团平台，提供战役管理、角色卡与房间实时协作体验。</p>
      <div class="meta-row">
        <span>当前版本</span>
        <strong>v{{ version }}</strong>
      </div>
      <div class="link-list">
        <a href="#" class="link">用户协议（占位）</a>
        <a href="#" class="link">隐私政策（占位）</a>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.settings-page { max-width: 720px; margin: 0 auto; }
.title { margin: 0 0 var(--space-4); font-size: var(--text-xl); font-weight: 700; }
.desc { margin: 0 0 var(--space-4); color: var(--color-text-secondary); line-height: 1.7; }
.meta-row { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) 0; border-top: 1px solid var(--color-card-border); }
.link-list { display: flex; flex-direction: column; gap: 8px; margin-top: var(--space-3); }
.link { color: var(--color-accent); text-decoration: none; }
.link:hover { text-decoration: underline; }
</style>
