<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';
import { useAuthStore } from '../../stores/auth-store';

const router = useRouter();
const authStore = useAuthStore();
const loading = ref(false);
const cards = ref<any[]>([]);

const normalizedCards = computed(() => cards.value.map((item) => {
  const activeCampaign = item.active_campaign_name || item.current_campaign_name || item.campaign_name || '';
  return {
    id: item.id,
    name: item.name || '未命名角色',
    rulesetName: item.ruleset_name || item.ruleset_id || '未知规则包',
    avatarUrl: item.avatar_url || '',
    activeCampaign,
    isActive: !!activeCampaign,
  };
}));

async function loadCharacters() {
  loading.value = true;
  try {
    const res = await fetch('/api/characters', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) throw new Error('加载失败');
    cards.value = await res.json();
  } catch {
    ElMessage.error('角色卡加载失败');
    cards.value = [];
  } finally {
    loading.value = false;
  }
}

function openEditor(id: string) {
  router.push(`/character/editor/${id}`);
}

onMounted(loadCharacters);
</script>

<template>
  <div class="characters-page">
    <div class="page-header">
      <h1 class="page-title">我的角色卡</h1>
      <TButton type="primary" size="sm" @click="router.push('/character/editor')">+ 新建</TButton>
    </div>

    <div v-if="loading" class="empty">正在加载角色卡...</div>
    <div v-else-if="normalizedCards.length === 0" class="empty">还没有角色卡，点击右上角创建第一张吧。</div>

    <div v-else class="cards-grid">
      <TCard
        v-for="card in normalizedCards"
        :key="card.id"
        padding="md"
        hoverable
        class="char-card"
        @click="openEditor(card.id)"
      >
        <div class="card-head">
          <div class="avatar-wrap">
            <img v-if="card.avatarUrl" :src="card.avatarUrl" class="avatar" />
            <div v-else class="avatar fallback">{{ card.name[0] }}</div>
          </div>
          <div class="main-info">
            <h3 class="name">{{ card.name }}</h3>
            <p class="ruleset">{{ card.rulesetName }}</p>
          </div>
          <TTag :color="card.isActive ? 'success' : 'default'" size="sm">
            {{ card.isActive ? '激活中' : '空闲' }}
          </TTag>
        </div>
        <p v-if="card.isActive" class="active-campaign">所在团：{{ card.activeCampaign }}</p>
      </TCard>
    </div>
  </div>
</template>

<style scoped>
.characters-page { max-width: 900px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }
.page-title { margin: 0; font-size: var(--text-2xl); font-weight: 700; }
.empty {
  background: var(--color-card-bg);
  border: 1px dashed var(--color-card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  text-align: center;
  color: var(--color-text-muted);
}
.cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-4); }
.char-card { cursor: pointer; }
.card-head { display: flex; align-items: center; gap: var(--space-3); }
.avatar-wrap { width: 48px; height: 48px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
.avatar.fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-accent);
  color: #fff;
  font-weight: 700;
}
.main-info { flex: 1; min-width: 0; }
.name { margin: 0; font-size: var(--text-base); }
.ruleset { margin: 2px 0 0; font-size: var(--text-sm); color: var(--color-text-muted); }
.active-campaign { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--color-success); }
</style>
