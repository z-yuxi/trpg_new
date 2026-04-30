<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TCard from '../../components/base/TCard.vue';
import TTag from '../../components/base/TTag.vue';
import TButton from '../../components/base/TButton.vue';
import TSkeleton from '../../components/base/TSkeleton.vue';
import EmptyState from '../../components/base/EmptyState.vue';
import { api } from '../../utils/api';
import { getToken } from '../../utils/api';

const router = useRouter();

const loading = ref(false);
const cards = ref<any[]>([]);
const exportingId = ref<string | null>(null);

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
    cards.value = await api.get<any[]>('/characters');
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

async function exportCSON(id: string, name: string) {
  exportingId.value = id;
  try {
    const { cson_text } = await api.post<{ cson_text: string }>(`/characters/${id}/export`, {});
    const blob = new Blob([cson_text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.cson`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    ElMessage.error(e?.message ?? '导出失败');
  } finally {
    exportingId.value = null;
  }
}

async function exportPDF(id: string, name: string) {
  exportingId.value = id;
  try {
    const res = await fetch(`/api/characters/${id}/export/pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        ElMessage.warning((data as any).error ?? '导出 PDF 需要 Pro 会员或以上');
        return;
      }
      throw new Error((data as any).error ?? 'PDF 导出失败');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    ElMessage.error(e?.message ?? 'PDF 导出失败');
  } finally {
    exportingId.value = null;
  }
}

onMounted(loadCharacters);
</script>

<template>
  <div class="characters-page">
    <div class="page-header">
      <h1 class="page-title">我的角色卡</h1>
      <TButton type="primary" size="sm" @click="router.push('/character/editor')">+ 新建</TButton>
    </div>

    <div v-if="loading" class="cards-grid">
      <TSkeleton type="list" :rows="1" v-for="i in 4" :key="i" />
    </div>
    <EmptyState
      v-else-if="normalizedCards.length === 0"
      icon-name=""
      illustration-name="illust-empty"
      title="还没有角色卡"
      description="点击右上角创建你的第一个角色。"
      action-text="新建角色"
      @action="router.push('/character/editor')"
    />

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
        <div class="card-actions" @click.stop>
          <TButton
            size="sm"
            type="ghost"
            :loading="exportingId === card.id"
            @click="exportCSON(card.id, card.name)"
          >导出 CSON</TButton>
          <TButton
            size="sm"
            type="ghost"
            :loading="exportingId === card.id"
            @click="exportPDF(card.id, card.name)"
          >导出 PDF <TTag size="sm" color="warning" style="margin-left:4px">Pro</TTag></TButton>
        </div>
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
.card-actions { display: flex; gap: var(--space-2); margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-card-border); }
</style>
