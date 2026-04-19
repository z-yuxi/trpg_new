<script setup lang="ts">
/**
 * VersionPanel.vue
 * 规则集版本管理面板：版本历史、保存版本、回滚、版本对比、从上游同步
 */
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

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
}

const versions = ref<VersionItem[]>([]);
const loading = ref(false);

async function fetchVersions() {
  if (!props.rulesetId || props.rulesetId === 'new') return;
  loading.value = true;
  try {
    const res = await fetch(`/api/rulesets/${props.rulesetId}/versions`, {
      headers: { Authorization: `Bearer ${props.authToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      versions.value = (data.data as VersionItem[]) ?? [];
    }
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
    const res = await fetch(`/api/rulesets/${props.rulesetId}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.authToken}` },
      body: JSON.stringify({ changelog: changelogInput.value }),
    });
    if (res.ok) {
      ElMessage.success('版本快照已保存');
      changelogInput.value = '';
      await fetchVersions();
    } else {
      const data = await res.json();
      ElMessage.error(data.error ?? '保存失败');
    }
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
    const res = await fetch(`/api/rulesets/${props.rulesetId}/versions/${versionId}/rollback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${props.authToken}` },
    });
    if (res.ok) {
      ElMessage.success(`已回滚到版本 ${versionNumber}`);
      emit('rolledback');
      await fetchVersions();
    } else {
      const data = await res.json();
      ElMessage.error(data.error ?? '回滚失败');
    }
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
    const res = await fetch(
      `/api/rulesets/${props.rulesetId}/versions/compare?a=${compareA.value}&b=${compareB.value}`,
      { headers: { Authorization: `Bearer ${props.authToken}` } },
    );
    if (res.ok) {
      diffResult.value = await res.json();
    } else {
      const data = await res.json();
      ElMessage.error(data.error ?? '对比失败');
    }
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
    const res = await fetch(`/api/rulesets/${props.rulesetId}/merge-from-parent`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${props.authToken}` },
    });
    const data = await res.json();
    if (res.ok) {
      emit('merged', data);
      if (data.conflicts?.length > 0) {
        ElMessage.warning(`合并完成，但有 ${data.conflicts.length} 个冲突需手动解决`);
      } else {
        ElMessage.success('已从上游合并，无冲突');
      }
    } else {
      ElMessage.error(data.error ?? '合并失败');
    }
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
            </div>
            <div v-if="v.changelog" class="version-changelog">{{ v.changelog }}</div>
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
.version-changelog { font-size: 12px; color: var(--color-text-secondary, #aaa); }

.loading-text, .empty-text {
  font-size: 12px;
  color: var(--color-text-secondary, #888);
  text-align: center;
  padding: 16px;
}
</style>
