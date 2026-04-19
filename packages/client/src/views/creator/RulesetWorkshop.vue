<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElDialog, ElMessage } from 'element-plus';
import { useAuthStore } from '../../stores/auth-store';

const router = useRouter();
const authStore = useAuthStore();

interface RulesetItem { id: string; name: string; version: string; status: string; }

const rulesets = ref<RulesetItem[]>([]);
const loading = ref(false);
const showNew = ref(false);
const newName = ref('');
const creating = ref(false);

async function loadRulesets() {
  loading.value = true;
  try {
    const res = await fetch('/api/rulesets?author_id=' + authStore.userId, { headers: { Authorization: `Bearer ${authStore.token}` } });
    if (res.ok) {
      const body = await res.json();
      // API 返回分页格式 { data: [], total: number }
      rulesets.value = Array.isArray(body) ? body : (body.data ?? []);
    }
  } catch { /* ignore */ } finally { loading.value = false; }
}

async function createRuleset() {
  if (!newName.value.trim()) { ElMessage.warning('请输入规则包名称'); return; }
  creating.value = true;
  try {
    const res = await fetch('/api/rulesets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({ name: newName.value.trim(), version: '0.1.0', status: 'draft' }),
    });
    if (res.ok) {
      const created = await res.json();
      showNew.value = false;
      newName.value = '';
      router.push(`/creator/workshop/${created.id}/edit`);
    } else {
      // POST not yet implemented — navigate to editor with "new" id
      showNew.value = false;
      router.push({ path: '/creator/workshop/new/edit', query: { name: newName.value.trim() } });
      newName.value = '';
    }
  } catch {
    showNew.value = false;
    router.push({ path: '/creator/workshop/new/edit', query: { name: newName.value.trim() } });
    newName.value = '';
  } finally { creating.value = false; }
}

onMounted(loadRulesets);
</script>

<template>
  <div class="workshop">
    <div class="workshop-header">
      <h2 class="page-title">规则工坊</h2>
      <button class="new-btn" @click="showNew = true">+ 新建规则包</button>
    </div>

    <div v-if="loading" class="empty-hint">加载中…</div>

    <div v-else-if="rulesets.length === 0" class="empty-state">
      <p class="empty-icon">📖</p>
      <p class="empty-title">暂无规则包</p>
      <p class="empty-desc">点击"新建规则包"开始创作你的第一个规则系统</p>
      <button class="new-btn" @click="showNew = true">+ 新建规则包</button>
    </div>

    <div v-else class="ruleset-grid">
      <div v-for="rs in rulesets" :key="rs.id" class="rs-card">
        <div class="rs-card-top">
          <span class="rs-name">{{ rs.name }}</span>
          <span class="rs-status" :class="rs.status">{{ rs.status === 'published' ? '已发布' : '草稿' }}</span>
        </div>
        <div class="rs-version">v{{ rs.version }}</div>
        <div class="rs-actions">
          <button class="edit-btn" @click="router.push(`/creator/workshop/${rs.id}/edit`)">编辑</button>
        </div>
      </div>
    </div>

    <ElDialog v-model="showNew" title="新建规则包" width="360px">
      <div class="form-body">
        <label class="form-label">规则包名称</label>
        <input v-model="newName" class="field-input" placeholder="如：克苏鲁的呼唤" @keydown.enter="createRuleset" />
      </div>
      <template #footer>
        <button class="dlg-btn" @click="showNew = false">取消</button>
        <button class="dlg-btn accent" @click="createRuleset" :disabled="creating">
          {{ creating ? '创建中…' : '创建' }}
        </button>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.workshop { max-width: 900px; }
.workshop-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-6); }
.page-title { font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); }
.new-btn {
  padding: var(--space-2) var(--space-4); background: var(--color-accent); color: #fff;
  border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm);
  transition: opacity var(--transition-fast);
}
.new-btn:hover { opacity: 0.85; }
.empty-state { text-align: center; padding: var(--space-16); }
.empty-icon { font-size: 48px; margin-bottom: var(--space-3); }
.empty-title { font-size: var(--text-lg); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-2); }
.empty-desc { font-size: var(--text-sm); color: var(--text-muted); margin-bottom: var(--space-4); }
.ruleset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4); }
.rs-card {
  padding: var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-lg);
  background: var(--surface-card); display: flex; flex-direction: column; gap: var(--space-2);
  transition: box-shadow var(--transition-fast);
}
.rs-card:hover { box-shadow: var(--shadow-md); }
.rs-card-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.rs-name { font-weight: 600; font-size: var(--text-base); color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rs-status { font-size: var(--text-xs); padding: 1px 8px; border-radius: 100px; flex-shrink: 0; }
.rs-status.draft { background: color-mix(in srgb, var(--text-muted) 15%, transparent); color: var(--text-muted); }
.rs-status.published { background: color-mix(in srgb, #22c55e 15%, transparent); color: #16a34a; }
.rs-version { font-size: var(--text-xs); color: var(--text-muted); font-family: var(--font-mono); }
.rs-actions { margin-top: auto; }
.edit-btn {
  width: 100%; padding: var(--space-1) 0; border: 1px solid var(--border-default); border-radius: var(--radius-sm);
  background: none; cursor: pointer; font-size: var(--text-sm); color: var(--text-primary);
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.edit-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
.form-body { display: flex; flex-direction: column; gap: var(--space-2); }
.form-label { font-size: var(--text-sm); font-weight: 500; color: var(--text-secondary); }
.field-input {
  width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--border-default);
  border-radius: var(--radius-md); background: var(--surface-card); color: var(--text-primary);
  font-size: var(--text-sm); box-sizing: border-box;
}
.field-input:focus { outline: none; border-color: var(--color-accent); }
.dlg-btn { padding: var(--space-2) var(--space-4); border: 1px solid var(--border-default); border-radius: var(--radius-md); background: none; cursor: pointer; font-size: var(--text-sm); color: var(--text-primary); margin-left: var(--space-2); }
.dlg-btn.accent { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.dlg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.empty-hint { text-align: center; color: var(--text-muted); font-size: var(--text-sm); padding: var(--space-6); }
</style>
