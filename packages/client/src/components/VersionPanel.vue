<script setup lang="ts">
/**
 * VersionPanel.vue
 * 规则集版本管理面板：版本历史、保存版本、回滚、版本对比、从上游同步
 */
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import SvgIcon from './SvgIcon.vue';
import { api } from '../utils/api';

const props = defineProps<{
  rulesetId: string;
  authToken: string;
  parentId?: string | null;
}>();

const emit = defineEmits<{
  (e: 'rolledback'): void;
  (e: 'merged', result: object): void;
}>();

// ── 版本列表 ───────────────────────────────────────────────────────────────
interface VersionItem {
  id: string;
  version_number: string;
  changelog: string;
  created_at: string;
  created_by?: string;
  snapshot_hash?: string;
}

const versions = ref<VersionItem[]>([]);
const loading = ref(false);

async function fetchVersions() {
  if (!props.rulesetId || props.rulesetId === 'new') return;
  loading.value = true;
  try {
    const data = await api.get<{ data: VersionItem[] }>(`/rulesets/${props.rulesetId}/versions`);
    versions.value = data.data ?? [];
  } finally {
    loading.value = false;
  }
}

onMounted(fetchVersions);

// ── 保存版本 ───────────────────────────────────────────────────────────────
const changelogInput = ref('');
const saving = ref(false);

async function saveVersion() {
  if (!props.rulesetId || props.rulesetId === 'new') {
    ElMessage.warning('请先保存规则集后再创建版本快照');
    return;
  }
  saving.value = true;
  try {
    await api.post(`/rulesets/${props.rulesetId}/versions`, { changelog: changelogInput.value });
    ElMessage.success('版本快照已保存');
    changelogInput.value = '';
    await fetchVersions();
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '保存失败');
  } finally {
    saving.value = false;
  }
}

// ── 回滚 ──────────────────────────────────────────────────────────────────
const rollbacking = ref<string | null>(null);

async function rollback(versionId: string, versionNumber: string) {
  if (!confirm(`确认回滚到版本 ${versionNumber}？当前草稿内容将被替换。`)) return;
  rollbacking.value = versionId;
  try {
    await api.post(`/rulesets/${props.rulesetId}/versions/${versionId}/rollback`, {});
    ElMessage.success(`已回滚到版本 ${versionNumber}`);
    emit('rolledback');
    await fetchVersions();
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '回滚失败');
  } finally {
    rollbacking.value = null;
  }
}

// ── 版本对比 ──────────────────────────────────────────────────────────────
const compareA = ref('');
const compareB = ref('');
const diffResult = ref<{ added_nodes: string[]; removed_nodes: string[]; modified_nodes: string[] } | null>(null);
const comparing = ref(false);

async function compareVersions() {
  if (!compareA.value || !compareB.value) {
    ElMessage.warning('请选择两个版本进行对比');
    return;
  }
  comparing.value = true;
  diffResult.value = null;
  try {
    diffResult.value = await api.get<{ added_nodes: string[]; removed_nodes: string[]; modified_nodes: string[] }>(
      `/rulesets/${props.rulesetId}/versions/compare?a=${compareA.value}&b=${compareB.value}`,
    );
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '对比失败');
  } finally {
    comparing.value = false;
  }
}

// ── 从上游同步 ─────────────────────────────────────────────────────────────
const merging = ref(false);

async function mergeFromParent() {
  if (!props.parentId) return;
  if (!confirm('从上游规则集合并变更？如有冲突需手动解决。')) return;
  merging.value = true;
  try {
    const data = await api.post<{ conflicts?: string[] }>(`/rulesets/${props.rulesetId}/merge-from-parent`, {});
    emit('merged', data);
    const conflicts = data.conflicts ?? [];
    if (conflicts.length > 0) {
      ElMessage.warning(`合并完成，但有 ${conflicts.length} 个冲突需手动解决`);
    } else {
      ElMessage.success('已从上游合并，无冲突');
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '合并失败');
  } finally {
    merging.value = false;
  }
}

// 格式化日期
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<template>
  <div class="version-panel">
    <!-- 保存版本 -->
    <section class="version-panel__section">
      <h5 class="section-title">保存版本快照</h5>
      <div class="save-row">
        <input
          v-model="changelogInput"
          class="version-input"
          placeholder="变更说明（可选）"
          @keydown.enter="saveVersion"
        />
        <button class="action-btn action-btn--primary" :disabled="saving" @click="saveVersion">
          <template v-if="saving">保存中…</template>
          <template v-else><SvgIcon name="icon-copy" :size="12" /> 保存版本</template>
        </button>
      </div>
    </section>

    <!-- 从上游同步（仅 fork 规则集） -->
    <section v-if="parentId" class="version-panel__section">
      <h5 class="section-title">从上游同步</h5>
      <button class="action-btn" :disabled="merging" @click="mergeFromParent">
        <template v-if="merging">合并中…</template>
        <template v-else><SvgIcon name="icon-download" :size="12" /> 从上游合并变更</template>
      </button>
    </section>

    <!-- 版本对比 -->
    <section class="version-panel__section" v-if="versions.length >= 2">
      <h5 class="section-title">版本对比</h5>
      <div class="compare-row">
        <select v-model="compareA" class="version-select">
          <option value="">选择版本 A</option>
          <option v-for="v in versions" :key="v.id" :value="v.id">{{ v.version_number }}</option>
        </select>
        <span class="compare-vs">vs</span>
        <select v-model="compareB" class="version-select">
          <option value="">选择版本 B</option>
          <option v-for="v in versions" :key="v.id" :value="v.id">{{ v.version_number }}</option>
        </select>
        <button class="action-btn" :disabled="comparing" @click="compareVersions">对比</button>
      </div>

      <div v-if="diffResult" class="diff-result">
        <div v-if="diffResult.added_nodes.length > 0" class="diff-group diff-added">
          <span class="diff-label">+ 新增节点（{{ diffResult.added_nodes.length }}）</span>
          <ul><li v-for="id in diffResult.added_nodes" :key="id">{{ id }}</li></ul>
        </div>
        <div v-if="diffResult.removed_nodes.length > 0" class="diff-group diff-removed">
          <span class="diff-label">- 删除节点（{{ diffResult.removed_nodes.length }}）</span>
          <ul><li v-for="id in diffResult.removed_nodes" :key="id">{{ id }}</li></ul>
        </div>
        <div v-if="diffResult.modified_nodes.length > 0" class="diff-group diff-modified">
          <span class="diff-label">～ 修改节点（{{ diffResult.modified_nodes.length }}）</span>
          <ul><li v-for="id in diffResult.modified_nodes" :key="id">{{ id }}</li></ul>
        </div>
        <div v-if="!diffResult.added_nodes.length && !diffResult.removed_nodes.length && !diffResult.modified_nodes.length"
          class="diff-same">两个版本内容相同</div>
      </div>
    </section>

    <!-- 版本历史列表 -->
    <section class="version-panel__section">
      <h5 class="section-title">
        版本历史
        <button class="refresh-btn" @click="fetchVersions" title="刷新"><SvgIcon name="icon-history" :size="12" /></button>
      </h5>
      <div v-if="loading" class="loading-text">加载中…</div>
      <div v-else-if="versions.length === 0" class="empty-text">暂无版本快照</div>
      <ul v-else class="version-timeline">
        <li v-for="v in versions" :key="v.id" class="version-item">
          <div class="version-item__dot"></div>
          <div class="version-item__content">
            <div class="version-item__header">
              <span class="version-num">{{ v.version_number }}</span>
              <span class="version-date">{{ formatDate(v.created_at) }}</span>
              <span v-if="v.created_by" class="version-author">by {{ v.created_by }}</span>
            </div>
            <div v-if="v.changelog" class="version-changelog">{{ v.changelog }}</div>
            <div v-if="v.snapshot_hash" class="version-hash">SHA: {{ v.snapshot_hash.slice(0, 8) }}</div>
            <button
              class="action-btn action-btn--sm action-btn--danger"
              :disabled="rollbacking === v.id"
              @click="rollback(v.id, v.version_number)"
            >
              {{ rollbacking === v.id ? '回滚中…' : '↩ 回滚到此版本' }}
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.version-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.version-panel__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #e0e0e0);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.refresh-btn {
  background: none;
  border: none;
  color: var(--color-text-secondary, #888);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}

.save-row, .compare-row {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.version-input {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
}

.version-select {
  padding: 5px 8px;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  flex: 1;
}

.compare-vs { font-size: 12px; color: var(--color-text-secondary, #888); }

.action-btn {
  padding: 5px 10px;
  font-size: 12px;
  background: var(--surface-card);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}
.action-btn:hover { background: var(--surface-hover); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn--primary { background: var(--color-primary, #5B8DB8); border-color: var(--color-primary, #5B8DB8); color: #fff; }
.action-btn--primary:hover { opacity: 0.85; }
.action-btn--danger { border-color: var(--color-error, #e74c3c); color: var(--color-error, #e74c3c); font-size: 11px; padding: 3px 8px; }
.action-btn--sm { font-size: 11px; padding: 3px 8px; }

/* diff */
.diff-result { margin-top: 4px; display: flex; flex-direction: column; gap: 6px; }
.diff-group { border-radius: 4px; padding: 6px 10px; font-size: 12px; }
.diff-added { background: color-mix(in srgb, #27ae60 15%, transparent); border-left: 3px solid #27ae60; }
.diff-removed { background: color-mix(in srgb, #e74c3c 15%, transparent); border-left: 3px solid #e74c3c; }
.diff-modified { background: color-mix(in srgb, #f5a623 15%, transparent); border-left: 3px solid #f5a623; }
.diff-label { font-weight: 600; display: block; margin-bottom: 4px; }
.diff-same { font-size: 12px; color: var(--color-text-secondary, #888); text-align: center; padding: 8px; }
.diff-group ul { margin: 0; padding-left: 16px; }
.diff-group li { margin: 2px 0; font-family: monospace; }

/* 版本时间线 */
.version-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; }
.version-item {
  display: flex;
  gap: 10px;
  position: relative;
  padding-bottom: 16px;
}
.version-item::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 14px;
  bottom: 0;
  width: 1px;
  background: var(--border-default);
}
.version-item:last-child::before { display: none; }
.version-item__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary, #5B8DB8);
  flex-shrink: 0;
  margin-top: 2px;
}
.version-item__content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.version-item__header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.version-num { font-size: 12px; font-weight: 600; color: var(--color-primary, #5B8DB8); }
.version-date { font-size: 11px; color: var(--color-text-secondary, #888); }
.version-author { font-size: 11px; color: var(--color-text-secondary, #888); font-style: italic; }
.version-hash { font-size: 10px; color: var(--color-text-secondary, #666); font-family: monospace; margin-top: 2px; }
.version-changelog { font-size: 12px; color: var(--color-text-secondary, #aaa); }

.loading-text, .empty-text {
  font-size: 12px;
  color: var(--color-text-secondary, #888);
  text-align: center;
  padding: 16px;
}
</style>
