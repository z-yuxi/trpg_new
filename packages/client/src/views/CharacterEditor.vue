<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';
import TInput from '../components/base/TInput.vue';
import { useAuthStore } from '../stores/auth-store';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const characterId = route.params.id as string | undefined;
const isEditing = !!characterId;

const form = ref({
  name: '',
  occupation_id: '',
  background: '',
  ruleset_id: 'coc7',
  attributes: { STR: 50, DEX: 50, POW: 50, CON: 50, APP: 50, SIZ: 50, INT: 60, EDU: 70 } as Record<string, number>,
  skills: {} as Record<string, number>,
});

const saving = ref(false);
const saveError = ref('');
const initialSnapshot = ref('');

function snapshotForm() {
  return JSON.stringify(form.value);
}

function hasUnsavedChanges() {
  return initialSnapshot.value !== '' && snapshotForm() !== initialSnapshot.value;
}

function confirmLeaveIfNeeded() {
  if (!hasUnsavedChanges()) return true;
  return window.confirm('有未保存的修改，确定离开？');
}

function goBackWithFallback() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/');
}

function handleCancel() {
  if (!confirmLeaveIfNeeded()) return;
  goBackWithFallback();
}

onMounted(async () => {
  if (isEditing && characterId) {
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        form.value.name = data.name ?? '';
        form.value.occupation_id = data.occupation_id ?? '';
        form.value.background = data.background ?? '';
        form.value.ruleset_id = data.ruleset_id ?? 'coc7';
        if (data.attributes) form.value.attributes = data.attributes;
        if (data.skills) form.value.skills = data.skills;
      }
    } catch { /* ignore */ }
  }
  initialSnapshot.value = snapshotForm();
});

onBeforeRouteLeave(() => confirmLeaveIfNeeded() || false);

async function save() {
  saveError.value = '';
  saving.value = true;
  try {
    const payload = {
      name: form.value.name,
      ruleset_id: form.value.ruleset_id,
      occupation_id: form.value.occupation_id || null,
      background: form.value.background,
      attributes: form.value.attributes,
      skills: form.value.skills,
    };
    const url = isEditing ? `/api/characters/${characterId}` : '/api/characters';
    const method = isEditing ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.push('/campaigns');
    } else {
      const data = await res.json();
      saveError.value = data.error || '保存失败';
    }
  } catch (e: any) {
    saveError.value = e.message || '网络错误';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="char-editor">
    <h1 class="page-title">{{ characterId ? '编辑角色' : '创建角色' }}</h1>
    <TCard padding="lg" shadow>
      <div class="section">
        <h2 class="section-title">基本信息</h2>
        <div class="grid-2">
          <div class="field">
            <label>姓名</label>
            <TInput v-model="form.name" placeholder="角色姓名" />
          </div>
          <div class="field">
            <label>职业</label>
            <TInput v-model="form.occupation_id" placeholder="职业" />
          </div>
        </div>
        <div class="field" style="margin-top:12px">
          <label>背景故事</label>
          <textarea v-model="form.background" class="textarea" rows="4" placeholder="填写角色背景故事..." />
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">基础属性</h2>
        <div class="attrs-grid">
          <div v-for="(val, key) in form.attributes" :key="key" class="attr-row">
            <label class="attr-label">{{ key }}</label>
            <input v-model.number="(form.attributes as any)[key]" type="number" class="attr-input" min="1" max="100" />
            <div class="attr-bar"><div class="attr-fill" :style="{ width: `${val}%` }" /></div>
          </div>
        </div>
      </div>

      <div class="actions">
        <TButton type="secondary" @click="handleCancel">取消</TButton>
        <TButton type="primary" @click="save" :loading="saving">保存角色</TButton>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.char-editor { max-width: 800px; margin: 0 auto; }
.page-title { font-size: var(--text-2xl); font-weight: 700; margin-bottom: var(--space-4); }
.section { margin-bottom: var(--space-6); }
.section-title { font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-card-border); padding-bottom: var(--space-2); }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-4); }
.field label { display: block; font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-1); }
.textarea { width: 100%; padding: var(--space-3); border: 1px solid var(--color-input-border); border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm); resize: vertical; font-family: var(--font-sans); }
.attrs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-3); }
.attr-row { display: flex; align-items: center; gap: var(--space-2); }
.attr-label { width: 40px; font-size: var(--text-sm); font-weight: 600; font-family: var(--font-mono); }
.attr-input { width: 56px; padding: 4px 8px; border: 1px solid var(--color-input-border); border-radius: var(--radius-md); text-align: center; font-size: var(--text-sm); }
.attr-bar { flex: 1; height: 6px; background: var(--color-card-border); border-radius: var(--radius-full); overflow: hidden; }
.attr-fill { height: 100%; background: var(--color-accent); border-radius: var(--radius-full); transition: width var(--transition-normal); }
.actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-4); }
</style>
