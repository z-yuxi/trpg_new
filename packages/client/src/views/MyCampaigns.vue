<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElDialog, ElForm, ElFormItem, ElInput, ElSelect, ElOption } from 'element-plus';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TTag from '../components/base/TTag.vue';

const router = useRouter();

const campaigns = ref([
  { id: '1', name: '克苏鲁之陟崖', status: 'running', room_code: 'ABC123', role: 'gm' },
  { id: '2', name: '黑暗幻想纪', status: 'preparing', room_code: 'XYZ789', role: 'player' },
]);

const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'danger' }> = {
  running: { label: '进行中', color: 'success' },
  preparing: { label: '准备中', color: 'warning' },
  paused: { label: '已暂停', color: 'default' },
  ended: { label: '已结束', color: 'danger' },
};

const showCreateDialog = ref(false);
const createForm = ref({ name: '', ruleset_id: '', module_id: '' });

const showJoinDialog = ref(false);
const joinCode = ref('');

function createCampaign() {
  // TODO: 调用 API
  showCreateDialog.value = false;
}

function joinCampaign() {
  if (joinCode.value.length !== 6) return;
  // TODO: 调用 API
  showJoinDialog.value = false;
}

function copyCode(code: string) {
  navigator.clipboard.writeText(code);
}
</script>

<template>
  <div class="my-campaigns">
    <div class="page-header">
      <h1 class="page-title">我的团</h1>
      <div class="header-actions">
        <TButton type="secondary" @click="showJoinDialog = true">加入团</TButton>
        <TButton type="primary" @click="showCreateDialog = true">创建团</TButton>
      </div>
    </div>

    <div class="campaigns-grid">
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

    <!-- 创建团弹窗 -->
    <ElDialog v-model="showCreateDialog" title="创建新团" width="420px">
      <ElForm :model="createForm" label-position="top">
        <ElFormItem label="团名" required>
          <ElInput v-model="createForm.name" maxlength="128" show-word-limit />
        </ElFormItem>
        <ElFormItem label="规则集" required>
          <ElSelect v-model="createForm.ruleset_id" placeholder="选择规则集" style="width:100%">
            <ElOption label="克苏鲁神话 7e" value="coc7" />
            <ElOption label="D&D 5e" value="dnd5e" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="模组（可选）">
          <ElSelect v-model="createForm.module_id" placeholder="选择模组" clearable style="width:100%">
            <ElOption label="恐惧大陆" value="mod1" />
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
