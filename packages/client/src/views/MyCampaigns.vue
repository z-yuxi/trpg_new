<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElDialog, ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElMessage } from 'element-plus';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TTag from '../components/base/TTag.vue';
import TSkeleton from '../components/base/TSkeleton.vue';
import EmptyState from '../components/base/EmptyState.vue';
import { api } from '../utils/api';

const router = useRouter();
type CampaignListItem = {
  id: string;
  name: string;
  status: string;
  role: 'gm' | 'player';
  room_code: string;
};

const campaigns = ref<CampaignListItem[]>([]);
const loading = ref(false);
const rulesetOptions = ref<Array<{ id: string; name: string }>>([]);
const moduleOptions = ref<Array<{ id: string; name: string }>>([]);
const createOptionsLoading = ref(false);

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'danger' }> = {
  running: { label: '进行中', color: 'success' },
  preparing: { label: '准备中', color: 'warning' },
  paused: { label: '已暂停', color: 'default' },
  ended: { label: '已结束', color: 'danger' },
};

async function loadCampaigns() {
  loading.value = true;
  try {
    campaigns.value = await api.get<CampaignListItem[]>('/campaigns');
  } catch { ElMessage.error('加载失败'); }
  finally { loading.value = false; }
}

onMounted(loadCampaigns);

const showCreateDialog = ref(false);
const createForm = ref({ name: '', ruleset_id: '', module_id: '' });
const createLoading = ref(false);

async function loadCreateOptions() {
  createOptionsLoading.value = true;
  try {
    const [rulesetRes, moduleRes] = await Promise.allSettled([
      api.get<{ data?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>>('/rulesets?status=published&limit=100'),
      api.get<{ data?: Array<{ id: string; name?: string; title?: string }> } | Array<{ id: string; name?: string; title?: string }>>('/modules?limit=100'),
    ]);

    if (rulesetRes.status === 'fulfilled') {
      const rulesetData = Array.isArray(rulesetRes.value) ? rulesetRes.value : (rulesetRes.value.data ?? []);
      rulesetOptions.value = rulesetData
        .filter((item) => item.id)
        .map((item) => ({ id: item.id, name: item.name }));
    } else {
      rulesetOptions.value = [];
    }

    if (moduleRes.status === 'fulfilled') {
      const moduleData = Array.isArray(moduleRes.value) ? moduleRes.value : (moduleRes.value.data ?? []);
      moduleOptions.value = moduleData
        .filter((item) => item.id)
        .map((item) => ({ id: item.id, name: item.title ?? item.name ?? '未命名模组' }));
    } else {
      moduleOptions.value = [];
    }
  } finally {
    createOptionsLoading.value = false;
  }
}

async function openCreateDialog() {
  showCreateDialog.value = true;
  await loadCreateOptions();
}

async function createCampaign() {
  if (!createForm.value.name || !createForm.value.ruleset_id) return;
  createLoading.value = true;
  try {
    await api.post('/campaigns', createForm.value);
    showCreateDialog.value = false;
    createForm.value = { name: '', ruleset_id: '', module_id: '' };
    await loadCampaigns();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '创建失败'); }
  finally { createLoading.value = false; }
}

const showJoinDialog = ref(false);
const joinCode = ref('');
const joinLoading = ref(false);

async function joinCampaign() {
  if (joinCode.value.length < 4) return;
  joinLoading.value = true;
  try {
    const campaign = await api.post<{ id: string }>('/campaigns/join', { code: joinCode.value });
    showJoinDialog.value = false;
    joinCode.value = '';
    router.push(`/room/${campaign.id}`);
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '加入失败，请检查房间码'); }
  finally { joinLoading.value = false; }
}

function copyCode(code: string) {
  navigator.clipboard.writeText(code);
  ElMessage.success('已复制');
}
</script>

<template>
  <div class="my-campaigns">
    <div class="page-header">
      <h1 class="page-title">我的房间</h1>
      <div class="header-actions">
        <TButton type="secondary" @click="showJoinDialog = true">加入房间</TButton>
        <TButton type="primary" @click="openCreateDialog">创建房间</TButton>
      </div>
    </div>

    <div v-if="loading" class="campaigns-grid">
      <TSkeleton type="card" v-for="i in 4" :key="i" />
    </div>
    <EmptyState
      v-else-if="campaigns.length === 0"
      icon-name=""
      illustration-name="illust-empty"
      title="还没有房间"
      description="创建或加入一个房间，开始一段属于你的共同叙事。"
      action-text="创建房间"
      @action="openCreateDialog"
    />
    <div v-else class="campaigns-grid">
      <TCard v-for="c in campaigns" :key="c.id" padding="md" hoverable>
        <div class="c-header">
          <span class="c-name">{{ c.name }}</span>
          <TTag :color="(statusMap[c.status]?.color as any)" size="sm">{{ statusMap[c.status]?.label }}</TTag>
        </div>
        <div class="c-meta">
          <span class="role-badge" :class="c.role">{{ c.role === 'gm' ? 'GM' : '玩家' }}</span>
          <code class="room-code" @click="copyCode(c.room_code)" title="点击复制">{{ c.room_code }}</code>
        </div>
        <TButton type="primary" size="sm" style="margin-top:12px" @click="router.push(`/room/${c.id}`)">
          进入房间
        </TButton>
      </TCard>
    </div>

    <!-- 创建房间弹窗 -->
    <ElDialog v-model="showCreateDialog" title="创建新房间" width="420px">
      <ElForm :model="createForm" label-position="top">
        <ElFormItem label="房间名" required>
          <ElInput v-model="createForm.name" maxlength="128" show-word-limit />
        </ElFormItem>
        <ElFormItem label="规则集" required>
          <ElSelect v-model="createForm.ruleset_id" placeholder="选择规则集" :loading="createOptionsLoading" style="width:100%">
            <ElOption v-for="item in rulesetOptions" :key="item.id" :label="item.name" :value="item.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="模组（可选）">
          <ElSelect v-model="createForm.module_id" placeholder="选择模组" :loading="createOptionsLoading" clearable style="width:100%">
            <ElOption v-for="item in moduleOptions" :key="item.id" :label="item.name" :value="item.id" />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <TButton type="secondary" @click="showCreateDialog = false">取消</TButton>
        <TButton type="primary" @click="createCampaign">创建</TButton>
      </template>
    </ElDialog>

    <!-- 加入团弹窗 -->
    <ElDialog v-model="showJoinDialog" title="加入团" width="360px">
      <ElInput v-model="joinCode" placeholder="输入 6 位房间代码" maxlength="6" style="font-family:var(--font-mono);letter-spacing:4px;text-align:center" />
      <template #footer>
        <TButton type="secondary" @click="showJoinDialog = false">取消</TButton>
        <TButton type="primary" :disabled="joinCode.length !== 6" @click="joinCampaign">加入</TButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.my-campaigns { max-width: 900px; margin: 0 auto; }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); }
.header-actions { display: flex; gap: var(--space-2); }
.campaigns-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--space-4); }
.c-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.c-name { font-weight: 600; font-size: var(--text-base); }
.c-meta { display: flex; align-items: center; gap: var(--space-3); }
.role-badge { font-size: var(--text-xs); font-weight: 600; padding: 2px 8px; border-radius: var(--radius-full); }
.role-badge.gm { background: #fef3c7; color: #92400e; }
.role-badge.player { background: #dbeafe; color: #1e40af; }
.room-code { font-family: var(--font-mono); font-size: var(--text-sm); cursor: pointer; color: var(--color-text-secondary); letter-spacing: 2px; }
.room-code:hover { color: var(--color-accent); }
</style>
