<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElDialog, ElMessage } from 'element-plus';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';
import { api } from '../../utils/api';

interface ModuleItem {
  id: string;
  name: string;
  ruleset_name?: string;
  status: 'draft' | 'reviewing' | 'public_notice' | 'public' | 'archived' | 'suspended';
  cover_url?: string;
  word_count?: number;
  download_count?: number;
  updated_at?: string;
  public_notice_end_at?: string | null;
}

const router = useRouter();
const loading = ref(false);
const modules = ref<ModuleItem[]>([]);
const creating = ref(false);
const showCreate = ref(false);
const createName = ref('');
const createRulesetId = ref('');
const rulesets = ref<Array<{ id: string; name: string }>>([]);

async function loadModules() {
  loading.value = true;
  try {
    const [modulePayload, rulesetPayload] = await Promise.all([
      api.get<unknown>('/modules/mine'),
      api.get<unknown>('/rulesets/mine'),
    ]);

    modules.value = Array.isArray(modulePayload) ? modulePayload : (modulePayload as { data?: ModuleItem[] }).data ?? [];

    const list = Array.isArray(rulesetPayload) ? rulesetPayload : (rulesetPayload as { data?: unknown[] }).data ?? [];
    rulesets.value = (list as { id: string; name: string }[]).map((item) => ({ id: item.id, name: item.name }));
  } finally {
    loading.value = false;
  }
}

function statusText(status: ModuleItem['status']) {
  return {
    draft: '草稿',
    reviewing: '审核中',
    public_notice: '公示期',
    public: '已发布',
    archived: '已下架',
    suspended: '已暂停',
  }[status] ?? status;
}

function statusColor(status: ModuleItem['status']) {
  return status === 'public' ? 'success' : status === 'reviewing' || status === 'public_notice' ? 'warning' : 'default';
}

async function createModule() {
  if (!createName.value.trim() || !createRulesetId.value) {
    ElMessage.warning('请填写模组名称并选择规则集');
    return;
  }

  creating.value = true;
  try {
    const created = await api.post<{ id: string }>('/modules', { name: createName.value.trim(), ruleset_id: createRulesetId.value });
    ElMessage.success('模组已创建');
    showCreate.value = false;
    createName.value = '';
    createRulesetId.value = '';
    router.push(`/creator/modules/${created.id}/edit`);
  } catch (error: any) {
    ElMessage.error(error?.message ?? '创建失败');
  } finally {
    creating.value = false;
  }
}

async function submitModule(moduleId: string) {
  try {
    await api.post(`/modules/${moduleId}/submit`, {});
    ElMessage.success('已提交审核');
    loadModules();
  } catch {
    ElMessage.error('提交审核失败');
  }
}

async function deleteModule(moduleId: string) {
  const confirmed = window.confirm('仅草稿模组可删除，确认继续吗？');
  if (!confirmed) return;
  try {
    await api.delete(`/modules/${moduleId}`);
    ElMessage.success('已删除模组');
    loadModules();
  } catch {
    ElMessage.error('删除失败');
  }
}

async function withdrawModule(moduleId: string) {
  const confirmed = window.confirm('撤回后模组将回到草稿状态，确认撤回吗？');
  if (!confirmed) return;
  try {
    await api.post(`/modules/${moduleId}/withdraw`, {});
    ElMessage.success('已撤回模组审核');
    loadModules();
  } catch {
    ElMessage.error('撤回失败');
  }
}

/** 计算公示期剩余时间文字 */
function noticeCountdown(endAt: string | null | undefined): string {
  if (!endAt) return '';
  const ms = new Date(endAt).getTime() - Date.now();
  if (ms <= 0) return '公示期已截止';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `公示期还剩 ${days} 天 ${hours} 时`;
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `公示期还剩 ${hours} 时 ${minutes} 分`;
}

onMounted(loadModules);
</script>

<template>
  <div class="module-page">
    <div class="module-header">
      <div>
        <h1>我的模组</h1>
        <p>管理草稿、提审状态与已发布作品。</p>
      </div>
      <TButton type="primary" @click="showCreate = true">新建模组</TButton>
    </div>

    <div v-if="loading" class="empty-state">正在加载模组…</div>
    <div v-else-if="modules.length === 0" class="empty-state">还没有模组，先创建一个吧。</div>
    <div v-else class="module-grid">
      <article v-for="item in modules" :key="item.id" class="module-card">
        <div class="cover">{{ (item.name || '?').slice(0, 1) }}</div>
        <div class="module-body">
          <div class="module-head">
            <div>
              <h2>{{ item.name }}</h2>
              <p>{{ item.ruleset_name || '未绑定规则集' }}</p>
            </div>
            <TTag :color="statusColor(item.status)" size="sm">{{ statusText(item.status) }}</TTag>
          </div>
          <div class="meta-row">
            <span>{{ item.word_count || 0 }} 字</span>
            <span>{{ item.download_count || 0 }} 下载</span>
            <span>{{ item.updated_at ? new Date(item.updated_at).toLocaleString() : '刚创建' }}</span>
            <span v-if="item.status === 'public_notice' && item.public_notice_end_at" class="notice-countdown">
              {{ noticeCountdown(item.public_notice_end_at) }}
            </span>
          </div>
          <div class="actions">
            <TButton type="secondary" size="sm" @click="router.push(`/creator/modules/${item.id}/edit`)">编辑</TButton>
            <TButton v-if="item.status === 'draft'" type="primary" size="sm" @click="submitModule(item.id)">提交审核</TButton>
            <TButton v-if="item.status === 'draft'" type="secondary" size="sm" @click="deleteModule(item.id)">删除</TButton>
            <TButton
              v-if="item.status === 'reviewing' || item.status === 'public_notice'"
              type="secondary"
              size="sm"
              @click="withdrawModule(item.id)"
            >撤回审核</TButton>
          </div>
        </div>
      </article>
    </div>

    <ElDialog v-model="showCreate" title="新建模组" width="420px">
      <div class="dialog-form">
        <label>模组名称</label>
        <input v-model="createName" class="input" placeholder="例如：雾港旧梦" />
        <label>规则集</label>
        <select v-model="createRulesetId" class="input">
          <option value="">请选择规则集</option>
          <option v-for="item in rulesets" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>
      <template #footer>
        <TButton type="secondary" @click="showCreate = false">取消</TButton>
        <TButton type="primary" :loading="creating" @click="createModule">创建</TButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.module-page { display: flex; flex-direction: column; gap: var(--space-5); }
.module-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}
.module-header h1 { margin: 0; font-size: 30px; color: var(--text-primary); }
.module-header p { margin: var(--space-2) 0 0; color: var(--text-secondary); }
.module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.module-card {
  display: grid;
  grid-template-columns: 108px minmax(0, 1fr);
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--surface-card);
}
.cover {
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, color-mix(in srgb, var(--color-primary, #2563eb) 18%, transparent), color-mix(in srgb, var(--color-warning, #f59e0b) 14%, transparent));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 800;
  color: var(--text-primary);
}
.module-body { display: flex; flex-direction: column; gap: var(--space-3); }
.module-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}
.module-head h2 { margin: 0; font-size: var(--text-lg); color: var(--text-primary); }
.module-head p { margin: 4px 0 0; color: var(--text-secondary); font-size: var(--text-sm); }
.meta-row { display: flex; flex-wrap: wrap; gap: var(--space-3); color: var(--text-muted); font-size: var(--text-xs); }
.notice-countdown { color: var(--color-warning, #f59e0b); font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.empty-state {
  padding: var(--space-10);
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-xl);
}
.dialog-form { display: flex; flex-direction: column; gap: var(--space-2); }
.dialog-form label { color: var(--text-secondary); font-size: var(--text-sm); }
.input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-primary);
}

@media (max-width: 768px) {
  .module-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .module-grid {
    grid-template-columns: 1fr;
  }

  .module-card {
    grid-template-columns: 1fr;
  }

  .cover {
    min-height: 120px;
  }
}
</style>
