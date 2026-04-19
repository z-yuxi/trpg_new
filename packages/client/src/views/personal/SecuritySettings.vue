<script setup lang="ts">
import TCard from '../../components/base/TCard.vue';
</script>

<template>
  <div class="settings-page">
    <TCard padding="lg" shadow>
      <h2 class="title">账号安全</h2>
      <div class="item">
        <h3>修改密码</h3>
        <p>此功能即将开放，你可以在这里完成密码更新。</p>
      </div>
      <div class="item">
        <h3>绑定手机号</h3>
        <p>此功能即将开放，用于账号找回与安全验证。</p>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.settings-page { max-width: 720px; margin: 0 auto; }
.title { margin: 0 0 var(--space-4); font-size: var(--text-xl); font-weight: 700; }
.item { padding: var(--space-3) 0; border-top: 1px solid var(--color-card-border); }
.item h3 { margin: 0 0 4px; font-size: var(--text-base); }
.item p { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
</style>
