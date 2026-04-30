<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';
import { useAuthStore } from '../../stores/auth-store';
import { api } from '../../utils/api';

const router = useRouter();

const authStore = useAuthStore();
const myRulesets = ref<any[]>([]);
const loading = ref(false);

onMounted(async () => {
  if (!authStore.isLoggedIn) return;
  loading.value = true;
  try {
    myRulesets.value = await api.get<unknown[]>('/rulesets');
  } catch { /* ignore */ }
  finally { loading.value = false; }
});
</script>

<template>
  <div class="my-assets-tab">
    <h3 class="sub-title">我的规则集</h3>
    <div class="asset-list">
      <div v-if="loading" class="empty">加载中...</div>
      <TCard v-else v-for="rs in myRulesets" :key="rs.id" padding="md">
        <div class="asset-row">
          <div>
            <div class="asset-name">{{ rs.name }}</div>
            <div class="asset-meta">
              <TTag :color="rs.status === 'published' ? 'success' : 'default'" size="sm">
                {{ rs.status === 'published' ? '已发布' : '草稿' }}
              </TTag>
              <span class="version">v{{ rs.version }}</span>
            </div>
          </div>
          <div class="actions">
            <TButton type="ghost" size="sm" @click="router.push(`/ruleset/${rs.id}`)">阅读</TButton>
          </div>
        </div>
      </TCard>
      <div v-if="!loading && myRulesets.length === 0" class="empty">暂无规则集，去创作者后台创建吧</div>
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
.actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
.empty { color: var(--color-text-muted); font-size: var(--text-sm); text-align: center; padding: var(--space-6); }
</style>
