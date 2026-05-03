<template>
  <div class="term-panel">
    <div class="term-panel__header">
      <span class="term-panel__title">术语白名单</span>
      <span class="term-panel__hint">AI 校对时这些词不会被标记为错误</span>
    </div>

    <!-- 术语列表 -->
    <div class="term-panel__list">
      <div
        v-for="(term, i) in localTerms"
        :key="i"
        class="term-tag"
      >
        <span class="term-tag__text">{{ term }}</span>
        <button class="term-tag__del" @click="removeTerm(i)" title="移除">×</button>
      </div>
      <div v-if="localTerms.length === 0" class="term-panel__empty">
        暂无自定义术语
      </div>
    </div>

    <!-- 新增输入 -->
    <div class="term-panel__input-row">
      <input
        v-model="draft"
        class="term-panel__input"
        placeholder="添加术语（如：SAN值、克苏鲁）"
        maxlength="64"
        @keydown.enter.prevent="addTerm"
      />
      <button class="term-panel__add-btn" :disabled="!draft.trim()" @click="addTerm">
        添加
      </button>
    </div>

    <!-- 保存/取消 -->
    <div class="term-panel__footer">
      <button
        class="term-panel__save-btn"
        :disabled="saving || !dirty"
        @click="save"
      >
        <template v-if="saving">保存中…</template>
        <template v-else>保存</template>
      </button>
      <button class="term-panel__cancel-btn" :disabled="saving" @click="$emit('close')">
        关闭
      </button>
      <span v-if="localTerms.length > 0" class="term-panel__count">
        {{ localTerms.length }}/100
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { saveModuleTerms } from '../../api/modules';

const props = defineProps<{
  moduleId: string;
  initialTerms?: string[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', terms: string[]): void;
}>();

const localTerms = ref<string[]>(props.initialTerms ? [...props.initialTerms] : []);
const draft = ref('');
const saving = ref(false);
const dirty = ref(false);

watch(localTerms, () => { dirty.value = true; }, { deep: true });

function addTerm() {
  const t = draft.value.trim();
  if (!t || localTerms.value.includes(t) || localTerms.value.length >= 100) return;
  localTerms.value.push(t);
  draft.value = '';
}

function removeTerm(index: number) {
  localTerms.value.splice(index, 1);
}

async function save() {
  if (!dirty.value || saving.value) return;
  saving.value = true;
  try {
    await saveModuleTerms(props.moduleId, localTerms.value);
    dirty.value = false;
    emit('saved', [...localTerms.value]);
  } catch (err: any) {
    console.error('保存术语白名单失败:', err?.message);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.term-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--surface-card);
  border-left: 1px solid var(--border-default);
  font-size: 13px;
  min-width: 260px;
}

.term-panel__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.term-panel__title {
  font-weight: 600;
  color: var(--color-text, #333);
}

.term-panel__hint {
  font-size: 11px;
  color: var(--color-text-secondary, #888);
}

.term-panel__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 36px;
  padding: 6px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--surface-page);
}

.term-panel__empty {
  font-size: 12px;
  color: var(--color-text-secondary, #aaa);
  align-self: center;
}

.term-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 8px;
  border-radius: 12px;
  background: var(--surface-hover);
  border: 1px solid var(--border-default);
  font-size: 12px;
  color: var(--color-text, #333);
}

.term-tag__del {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary, #888);
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  transition: color 0.12s;
}

.term-tag__del:hover {
  color: #e53e3e;
}

.term-panel__input-row {
  display: flex;
  gap: 6px;
}

.term-panel__input {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--surface-page);
  color: var(--color-text, #333);
  outline: none;
  transition: border-color 0.15s;
}

.term-panel__input:focus {
  border-color: var(--color-primary, #4a6fa5);
}

.term-panel__add-btn {
  padding: 5px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--surface-page);
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text, #555);
  transition: background 0.12s;
  white-space: nowrap;
}

.term-panel__add-btn:not(:disabled):hover {
  background: var(--color-primary, #4a6fa5);
  color: #fff;
  border-color: var(--color-primary, #4a6fa5);
}

.term-panel__add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.term-panel__footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.term-panel__save-btn {
  padding: 5px 16px;
  border: none;
  border-radius: 6px;
  background: var(--color-primary, #4a6fa5);
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.15s;
}

.term-panel__save-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.term-panel__cancel-btn {
  padding: 5px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-secondary, #888);
}

.term-panel__count {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-secondary, #888);
}
</style>
