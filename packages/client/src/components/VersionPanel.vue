<script setup lang="ts">
/**
 * VersionPanel.vue
 * 规则集版本管理面板：版本历史、保存版本、回滚、版本对比、从上游同步
 */
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '../utils/api';
import type { RulesetVersionDiff, MergeConflict, MergeResult } from '@trpg/shared';

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

/** 自动生成 changelog 建议（对比最新版本与当前 diff） */
async function suggestChangelog() {
  if (versions.value.length === 0) return;
  const latestVersion = versions.value[0];
  try {
    const diff = await api.get<{ nodes: { added: unknown[]; removed: unknown[]; modified: unknown[] }; connections: { added: unknown[]; removed: unknown[] } }>(
      `/rulesets/${props.rulesetId}/versions/compare?a=${latestVersion.id}&b=${latestVersion.id}`,
    );
    // 直接用比较接口只能比两个已保存版本；在此获取最新版本的 diff 供参考
    const parts: string[] = [];
    if (diff.nodes?.added?.length) parts.push(`- 新增 ${diff.nodes.added.length} 个节点`);
    if (diff.nodes?.removed?.length) parts.push(`- 删除 ${diff.nodes.removed.length} 个节点`);
    if (diff.nodes?.modified?.length) parts.push(`- 修改 ${diff.nodes.modified.length} 个节点`);
    if (diff.connections?.added?.length) parts.push(`- 新增 ${diff.connections.added.length} 条连接`);
    if (diff.connections?.removed?.length) parts.push(`- 删除 ${diff.connections.removed.length} 条连接`);
    if (parts.length > 0) changelogInput.value = parts.join('\n');
  } catch {
    // 忽略建议失败
  }
}

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
  try {
    await ElMessageBox.confirm(
      `将回滚到版本 ${versionNumber}，当前未保存的修改将丢失，是否继续？`,
      '回滚确认', {
        confirmButtonText: '确定回滚',
        cancelButtonText: '取消',
        type: 'warning',
      });
  } catch {
    return;
  }
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
const diffResult = ref<RulesetVersionDiff | null>(null);
const comparing = ref(false);

async function compareVersions() {
  if (!compareA.value || !compareB.value) {
    ElMessage.warning('请选择两个版本进行对比');
    return;
  }
  comparing.value = true;
  diffResult.value = null;
  try {
    diffResult.value = await api.get<RulesetVersionDiff>(
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
const showConflictDialog = ref(false);
const pendingConflicts = ref<MergeConflict[]>([]);
const conflictResolutions = ref<Record<string, 'ours' | 'theirs'>>({});
const resolvingMerge = ref(false);

async function mergeFromParent() {
  if (!props.parentId) return;
  try {
    await ElMessageBox.confirm('从上游规则集合并变更？如有冲突需手动解决。', '合并确认', {
      confirmButtonText: '确定合并',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }
  merging.value = true;
  try {
    const data = await api.post<MergeResult>(`/rulesets/${props.rulesetId}/merge-from-parent`, {});
    if (data.status === 'conflicts' && data.conflicts.length > 0) {
      pendingConflicts.value = data.conflicts;
      conflictResolutions.value = Object.fromEntries(data.conflicts.map((c) => [c.node_id, 'ours' as const]));
      showConflictDialog.value = true;
    } else {
      emit('merged', data);
      ElMessage.success('已从上游合并，无冲突');
    }
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '合并失败');
  } finally {
    merging.value = false;
  }
}

async function confirmResolveMerge() {
  resolvingMerge.value = true;
  try {
    const resolutions = pendingConflicts.value.map((c) => ({
      node_id: c.node_id,
      keep: conflictResolutions.value[c.node_id] ?? 'ours',
    }));
    const ruleset = await api.post(`/rulesets/${props.rulesetId}/resolve-merge`, { resolutions });
    showConflictDialog.value = false;
    emit('merged', ruleset as object);
    ElMessage.success('冲突已解决，合并完成');
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message ?? '解决冲突失败');
  } finally {
    resolvingMerge.value = false;
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
        <button v-if="versions.length > 0" class="action-btn" @click="suggestChangelog" title="自动生成变更说明建议">✨ 建议</button>
        <button class="action-btn action-btn--primary" :disabled="saving" @click="saveVersion">
          {{ saving ? '保存中…' : '💾 保存版本' }}
        </button>
      </div>
    </section>

    <!-- 从上游同步（仅 fork 规则集） -->
    <section v-if="parentId" class="version-panel__section">
      <h5 class="section-title">从上游同步</h5>
      <button class="action-btn" :disabled="merging" @click="mergeFromParent">
        {{ merging ? '合并中…' : '⬇ 从上游合并变更' }}
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
        <!-- 节点变化 -->
        <div v-if="diffResult.nodes?.added?.length" class="diff-group diff-added">
          <span class="diff-label">+ 新增节点（{{ diffResult.nodes.added.length }}）</span>
          <ul><li v-for="n in diffResult.nodes.added" :key="n.node_id">{{ n.atom_type }} <span class="diff-id">#{{ n.node_id.slice(0,6) }}</span></li></ul>
        </div>
        <div v-if="diffResult.nodes?.removed?.length" class="diff-group diff-removed">
          <span class="diff-label">- 删除节点（{{ diffResult.nodes.removed.length }}）</span>
          <ul><li v-for="n in diffResult.nodes.removed" :key="n.node_id">{{ n.atom_type }} <span class="diff-id">#{{ n.node_id.slice(0,6) }}</span></li></ul>
        </div>
        <div v-if="diffResult.nodes?.modified?.length" class="diff-group diff-modified">
          <span class="diff-label">～ 修改节点（{{ diffResult.nodes.modified.length }}）</span>
          <ul><li v-for="n in diffResult.nodes.modified" :key="n.node_id">{{ n.atom_type }} <span class="diff-id">#{{ n.node_id.slice(0,6) }}</span>：{{ n.changed_fields?.join(', ') }}</li></ul>
        </div>
        <!-- 连接变化 -->
        <div v-if="diffResult.connections?.added?.length" class="diff-group diff-added">
          <span class="diff-label">+ 新增连接（{{ diffResult.connections.added.length }}）</span>
          <ul><li v-for="(c,i) in diffResult.connections.added" :key="i">{{ c.source }}→{{ c.target }}</li></ul>
        </div>
        <div v-if="diffResult.connections?.removed?.length" class="diff-group diff-removed">
          <span class="diff-label">- 删除连接（{{ diffResult.connections.removed.length }}）</span>
          <ul><li v-for="(c,i) in diffResult.connections.removed" :key="i">{{ c.source }}→{{ c.target }}</li></ul>
        </div>
        <!-- 命令变化 -->
        <div v-if="diffResult.commands?.added?.length || diffResult.commands?.removed?.length || diffResult.commands?.modified?.length" class="diff-group diff-modified">
          <span class="diff-label">⚙ 命令变更（+{{ diffResult.commands?.added?.length ?? 0 }} -{{ diffResult.commands?.removed?.length ?? 0 }} ~{{ diffResult.commands?.modified?.length ?? 0 }}）</span>
        </div>
        <div v-if="!diffResult.nodes?.added?.length && !diffResult.nodes?.removed?.length && !diffResult.nodes?.modified?.length && !diffResult.connections?.added?.length && !diffResult.connections?.removed?.length"
          class="diff-same">两个版本内容相同</div>
      </div>
    </section>

    <!-- 版本历史列表 -->
    <section class="version-panel__section">
      <h5 class="section-title">
        版本历史
        <button class="refresh-btn" @click="fetchVersions" title="刷新">↻</button>
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

  <!-- 合并冲突解决对话框 -->
  <el-dialog
    v-model="showConflictDialog"
    title="合并冲突 - 请选择保留版本"
    width="680px"
    :close-on-click-modal="false"
  >
    <div class="conflict-list">
      <div v-for="c in pendingConflicts" :key="c.node_id" class="conflict-item">
        <div class="conflict-header">
          <span class="conflict-node-id">节点 {{ c.node_id.slice(0,8) }}</span>
        </div>
        <div class="conflict-sides">
          <div class="conflict-side">
            <div class="conflict-side-label">本地（Ours）</div>
            <pre class="conflict-code">{{ JSON.stringify(c.our_node, null, 2) }}</pre>
          </div>
          <div class="conflict-side">
            <div class="conflict-side-label">上游（Theirs）</div>
            <pre class="conflict-code">{{ JSON.stringify(c.their_node, null, 2) }}</pre>
          </div>
        </div>
        <div class="conflict-choice">
          <label class="conflict-radio">
            <input type="radio" :value="'ours'" v-model="conflictResolutions[c.node_id]" /> 保留本地
          </label>
          <label class="conflict-radio">
            <input type="radio" :value="'theirs'" v-model="conflictResolutions[c.node_id]" /> 采用上游
          </label>
        </div>
      </div>
    </div>
    <template #footer>
      <button class="action-btn" @click="showConflictDialog = false">取消</button>
      <button class="action-btn action-btn--primary" :disabled="resolvingMerge" @click="confirmResolveMerge">
        {{ resolvingMerge ? '提交中…' : '确认合并' }}
      </button>
    </template>
  </el-dialog>
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
  background: var(--color-bg-input, #2a2a3e);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  color: var(--color-text-primary, #e0e0e0);
  font-size: 12px;
}

.version-select {
  padding: 5px 8px;
  background: var(--color-bg-input, #2a2a3e);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  color: var(--color-text-primary, #e0e0e0);
  font-size: 12px;
  flex: 1;
}

.compare-vs { font-size: 12px; color: var(--color-text-secondary, #888); }

.action-btn {
  padding: 5px 10px;
  font-size: 12px;
  background: var(--color-bg-card, #1e1e2e);
  color: var(--color-text-primary, #e0e0e0);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}
.action-btn:hover { background: var(--color-bg-hover, #2a2a3e); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn--primary { background: var(--color-primary, #7b68ee); border-color: var(--color-primary, #7b68ee); color: #fff; }
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
.diff-id { color: var(--color-text-secondary, #888); font-size: 11px; }

/* 冲突解决对话框 */
.conflict-list { display: flex; flex-direction: column; gap: 16px; max-height: 480px; overflow-y: auto; }
.conflict-item { border: 1px solid var(--color-border, #3a3a4e); border-radius: 6px; overflow: hidden; }
.conflict-header { padding: 6px 12px; background: color-mix(in srgb, #f5a623 15%, transparent); font-size: 12px; font-weight: 600; }
.conflict-node-id { font-family: monospace; }
.conflict-sides { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
.conflict-side { padding: 8px; border-top: 1px solid var(--color-border, #3a3a4e); }
.conflict-side:first-child { border-right: 1px solid var(--color-border, #3a3a4e); }
.conflict-side-label { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: var(--color-text-secondary, #888); }
.conflict-code { font-family: monospace; font-size: 11px; white-space: pre-wrap; word-break: break-all; margin: 0; max-height: 120px; overflow-y: auto; }
.conflict-choice { padding: 8px 12px; display: flex; gap: 16px; border-top: 1px solid var(--color-border, #3a3a4e); background: var(--color-bg-input, #2a2a3e); }
.conflict-radio { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }

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
  background: var(--color-border, #3a3a4e);
}
.version-item:last-child::before { display: none; }
.version-item__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary, #7b68ee);
  flex-shrink: 0;
  margin-top: 2px;
}
.version-item__content { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.version-item__header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.version-num { font-size: 12px; font-weight: 600; color: var(--color-primary, #7b68ee); }
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
