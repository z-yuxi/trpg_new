<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElDialog, ElInput, ElMessage } from 'element-plus';
import TButton from '../../components/base/TButton.vue';
import TTag from '../../components/base/TTag.vue';
import { api } from '../../utils/api';

interface RulesetItem {
  id: string;
  name: string;
  version: string;
  status: 'draft' | 'published' | 'reviewing' | 'deprecated';
  fork_count?: number;
  parent_id?: string | null;
  parent_ruleset_id?: string | null;
  created_at?: string;
}

interface RulesetVersionItem {
  id: string;
  version_number: string;
  changelog: string;
  created_at: string;
}

const router = useRouter();

const rulesets = ref<RulesetItem[]>([]);
const loading = ref(false);
const activeFilter = ref<'all' | RulesetItem['status']>('all');

const showNew = ref(false);
const newName = ref('');
const creating = ref(false);
const publishTargetId = ref<string | null>(null);
const forking = ref<string | null>(null);

const showVersionDialog = ref(false);
const versionLoading = ref(false);
const versionRuleset = ref<RulesetItem | null>(null);
const versions = ref<RulesetVersionItem[]>([]);
const snapshotChangelog = ref('');
const savingVersion = ref(false);
const rollingBackVersionId = ref<string | null>(null);

const filteredRulesets = computed(() => {
  const source = [...rulesets.value].sort((left, right) => new Date(right.created_at ?? '').getTime() - new Date(left.created_at ?? '').getTime());
  if (activeFilter.value === 'all') return source;
  return source.filter((item) => item.status === activeFilter.value);
});

function statusLabel(status: RulesetItem['status']) {
  return {
    draft: '草稿',
    published: '已发布',
    reviewing: '审核中',
    deprecated: '已弃用',
  }[status] ?? status;
}

function statusColor(status: RulesetItem['status']) {
  return status === 'published' ? 'success' : status === 'reviewing' ? 'warning' : 'default';
}

async function loadRulesets() {
  loading.value = true;
  try {
    const body = await api.get<unknown>('/rulesets/mine');
    rulesets.value = Array.isArray(body) ? body : (body as { data?: RulesetItem[] }).data ?? [];
  } catch (error: any) {
    ElMessage.error(error?.message ?? '规则集加载失败');
  } finally {
    loading.value = false;
  }
}

async function createRuleset() {
  if (!newName.value.trim()) {
    ElMessage.warning('请输入规则包名称');
    return;
  }

  creating.value = true;
  try {
    const created = await api.post<{ id: string }>('/rulesets', { name: newName.value.trim(), version: '0.1.0' });
    showNew.value = false;
    newName.value = '';
    router.push(`/creator/workshop/${created.id}/edit`);
  } catch (error: any) {
    ElMessage.error(error?.message ?? '创建失败');
  } finally {
    creating.value = false;
  }
}

async function publishRuleset(rulesetId: string) {
  publishTargetId.value = rulesetId;
  try {
    await api.post(`/rulesets/${rulesetId}/publish`, {});
    ElMessage.success('规则集已发布');
    await loadRulesets();
  } catch (error: any) {
    ElMessage.error(error?.message ?? '发布失败');
  } finally {
    publishTargetId.value = null;
  }
}

async function forkRuleset(rs: RulesetItem) {
  if (!window.confirm(`Fork「${rs.name}」？将创建一份独立草稿。`)) return;
  forking.value = rs.id;
  try {
    const data = await api.post<{ new_ruleset: { id: string } }>(`/rulesets/${rs.id}/fork`, {});
    ElMessage.success('Fork 成功');
    await loadRulesets();
    router.push(`/creator/workshop/${data.new_ruleset.id}/edit`);
  } catch (error: any) {
    ElMessage.error(error?.message ?? 'Fork 失败');
  } finally {
    forking.value = null;
  }
}

async function openVersions(rs: RulesetItem) {
  versionRuleset.value = rs;
  showVersionDialog.value = true;
  versionLoading.value = true;
  try {
    const body = await api.get<unknown>(`/rulesets/${rs.id}/versions`);
    versions.value = Array.isArray(body) ? body : (body as { data?: unknown[] }).data ?? [];
  } catch (error: any) {
    ElMessage.error(error?.message ?? '版本列表加载失败');
  } finally {
    versionLoading.value = false;
  }
}

async function createSnapshot() {
  if (!versionRuleset.value) return;
  savingVersion.value = true;
  try {
    await api.post(`/rulesets/${versionRuleset.value.id}/versions`, { changelog: snapshotChangelog.value.trim() });
    ElMessage.success('版本快照已创建');
    snapshotChangelog.value = '';
    await openVersions(versionRuleset.value);
  } catch (error: any) {
    ElMessage.error(error?.message ?? '创建版本失败');
  } finally {
    savingVersion.value = false;
  }
}

async function rollbackVersion(versionId: string) {
  if (!versionRuleset.value) return;
  const confirmed = window.confirm('回滚会用当前快照覆盖编辑中的规则集，确认继续吗？');
  if (!confirmed) return;
  rollingBackVersionId.value = versionId;
  try {
    await api.post(`/rulesets/${versionRuleset.value.id}/versions/${versionId}/rollback`, {});
    ElMessage.success('已回滚到指定版本');
    await loadRulesets();
    await openVersions(versionRuleset.value);
  } catch (error: any) {
    ElMessage.error(error?.message ?? '回滚失败');
  } finally {
    rollingBackVersionId.value = null;
  }
}

onMounted(loadRulesets);
</script>

<template>
  <div class="workshop">
    <div class="workshop-header">
      <div>
        <h1 class="page-title">规则工坊</h1>
        <p class="page-desc">管理规则集状态、版本快照与 Fork 来源。</p>
      </div>
      <TButton type="primary" @click="showNew = true">新建规则集</TButton>
    </div>

    <div class="filter-bar mobile-scroll-tabs">
      <button class="filter-pill" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">全部</button>
      <button class="filter-pill" :class="{ active: activeFilter === 'draft' }" @click="activeFilter = 'draft'">草稿</button>
      <button class="filter-pill" :class="{ active: activeFilter === 'published' }" @click="activeFilter = 'published'">已发布</button>
      <button class="filter-pill" :class="{ active: activeFilter === 'reviewing' }" @click="activeFilter = 'reviewing'">审核中</button>
      <button class="filter-pill" :class="{ active: activeFilter === 'deprecated' }" @click="activeFilter = 'deprecated'">已弃用</button>
    </div>

    <div v-if="loading" class="empty-state">加载规则集列表中…</div>
    <div v-else-if="filteredRulesets.length === 0" class="empty-state">当前筛选下还没有规则集。</div>
    <div v-else class="ruleset-grid">
      <article v-for="rs in filteredRulesets" :key="rs.id" class="rs-card">
        <div class="rs-card-top">
          <div>
            <h2 class="rs-name">{{ rs.name }}</h2>
            <div class="rs-meta-row">
              <span>v{{ rs.version }}</span>
              <span>{{ rs.created_at ? new Date(rs.created_at).toLocaleString() : '刚创建' }}</span>
            </div>
          </div>
          <TTag :color="statusColor(rs.status)" size="sm">{{ statusLabel(rs.status) }}</TTag>
        </div>

        <div class="fork-line">
          <span>Fork 次数：{{ rs.fork_count ?? 0 }}</span>
          <span v-if="rs.parent_id || rs.parent_ruleset_id">Forked from 上游规则集</span>
        </div>

        <div class="rs-actions">
          <TButton type="secondary" size="sm" @click="router.push(`/creator/workshop/${rs.id}/edit`)">编辑</TButton>
          <TButton type="secondary" size="sm" @click="openVersions(rs)">版本</TButton>
          <TButton v-if="rs.status === 'draft'" type="primary" size="sm" :loading="publishTargetId === rs.id" @click="publishRuleset(rs.id)">发布</TButton>
          <TButton v-if="rs.status === 'published'" type="secondary" size="sm" :loading="forking === rs.id" @click="forkRuleset(rs)">Fork</TButton>
        </div>
      </article>
    </div>

    <ElDialog v-model="showNew" title="新建规则集" width="420px">
      <div class="dialog-body">
        <label>规则集名称</label>
        <ElInput v-model="newName" maxlength="64" placeholder="例如：COC7 城市悬疑变体" @keydown.enter="createRuleset" />
      </div>
      <template #footer>
        <TButton type="secondary" @click="showNew = false">取消</TButton>
        <TButton type="primary" :loading="creating" @click="createRuleset">创建</TButton>
      </template>
    </ElDialog>

    <ElDialog v-model="showVersionDialog" :title="versionRuleset ? `${versionRuleset.name} · 版本历史` : '版本历史'" width="720px">
      <div class="version-toolbar">
        <ElInput v-model="snapshotChangelog" maxlength="200" placeholder="为这次快照填写简短变更说明" />
        <TButton type="primary" :loading="savingVersion" @click="createSnapshot">创建新版本</TButton>
      </div>

      <div v-if="versionLoading" class="empty-state">加载版本中…</div>
      <div v-else-if="versions.length === 0" class="empty-state">还没有版本快照，可先创建一份。</div>
      <div v-else class="version-list">
        <div v-for="item in versions" :key="item.id" class="version-item">
          <div>
            <strong>{{ item.version_number }}</strong>
            <p>{{ item.changelog || '无变更说明' }}</p>
            <span>{{ new Date(item.created_at).toLocaleString() }}</span>
          </div>
          <TButton type="secondary" size="sm" :loading="rollingBackVersionId === item.id" @click="rollbackVersion(item.id)">回滚到此版本</TButton>
        </div>
      </div>
    </ElDialog>
  </div>
</template>

<style scoped>
.workshop {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.workshop-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-4);
}
.page-title { margin: 0; font-size: 32px; color: var(--text-primary); }
.page-desc { margin: var(--space-2) 0 0; color: var(--text-secondary); }
.filter-bar {
  display: flex;
  gap: var(--space-2);
}
.filter-pill {
  padding: 8px 14px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-pill.active {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  border-color: color-mix(in srgb, var(--color-accent) 32%, transparent);
  color: var(--color-accent);
}
.ruleset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
.rs-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--surface-card);
}
.rs-card-top {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}
.rs-name { margin: 0; font-size: var(--text-lg); color: var(--text-primary); }
.rs-meta-row { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: 6px; color: var(--text-muted); font-size: var(--text-xs); }
.fork-line { display: flex; justify-content: space-between; gap: var(--space-3); color: var(--text-secondary); font-size: var(--text-sm); }
.rs-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.empty-state {
  padding: var(--space-10);
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-xl);
}
.dialog-body { display: flex; flex-direction: column; gap: var(--space-2); }
.dialog-body label { font-size: var(--text-sm); color: var(--text-secondary); }
.version-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.version-list { display: flex; flex-direction: column; gap: var(--space-3); }
.version-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}
.version-item strong { color: var(--text-primary); }
.version-item p { margin: 6px 0; color: var(--text-secondary); }
.version-item span { color: var(--text-muted); font-size: var(--text-xs); }

@media (max-width: 768px) {
  .workshop-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .ruleset-grid {
    grid-template-columns: 1fr;
  }

  .fork-line,
  .version-item,
  .version-toolbar {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
