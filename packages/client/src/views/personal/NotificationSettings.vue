<script setup lang="ts">
import { ref } from 'vue';
import TCard from '../../components/base/TCard.vue';

const notifyMentions = ref(true);
const notifySystem = ref(true);
const notifyInvite = ref(true);
</script>

<template>
  <div class="settings-page">
    <TCard padding="lg" shadow>
      <h2 class="title">消息通知设置</h2>
      <label class="toggle-row">
        <span>@ 提及通知</span>
        <input v-model="notifyMentions" type="checkbox" />
      </label>
      <label class="toggle-row">
        <span>系统公告通知</span>
        <input v-model="notifySystem" type="checkbox" />
      </label>
      <label class="toggle-row">
        <span>组团邀请通知</span>
        <input v-model="notifyInvite" type="checkbox" />
      </label>
    </TCard>
  </div>
</template>

<style scoped>
.settings-page { max-width: 720px; margin: 0 auto; }
.title { margin: 0 0 var(--space-4); font-size: var(--text-xl); font-weight: 700; }
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) 0;
  border-top: 1px solid var(--color-card-border);
  color: var(--color-text-primary);
}
</style>
