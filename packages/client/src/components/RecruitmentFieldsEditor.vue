<script setup lang="ts">
import { ref, watch } from 'vue';

// ── 类型定义 ────────────────────────────────────────────────────────────
export type FieldType = 'text' | 'number' | 'range' | 'boolean' | 'select';

export interface RecruitmentField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  // number/range
  min?: number;
  max?: number;
  // select
  options?: string[];
  // 说明文字
  hint?: string;
}

// ── Props / Emits ───────────────────────────────────────────────────────
const props = withDefaults(defineProps<{
  modelValue?: RecruitmentField[];
}>(), {
  modelValue: () => [],
});

const emit = defineEmits<{ (e: 'update:modelValue', v: RecruitmentField[]): void }>();

// ── 本地副本 ─────────────────────────────────────────────────────────────
const fields = ref<RecruitmentField[]>(JSON.parse(JSON.stringify(props.modelValue)));

watch(() => props.modelValue, (v) => {
  fields.value = JSON.parse(JSON.stringify(v));
}, { deep: true });

function emitUpdate() {
  emit('update:modelValue', JSON.parse(JSON.stringify(fields.value)));
}

// ── 操作 ──────────────────────────────────────────────────────────────
const expandedIdx = ref<number | null>(null);

function addField() {
  fields.value.push({
    key: '',
    label: '',
    type: 'text',
    required: false,
    options: [],
  });
  expandedIdx.value = fields.value.length - 1;
  emitUpdate();
}

function removeField(i: number) {
  fields.value.splice(i, 1);
  if (expandedIdx.value === i) expandedIdx.value = null;
  emitUpdate();
}

function toggleField(i: number) {
  expandedIdx.value = expandedIdx.value === i ? null : i;
}

// select 选项操作
function addOption(field: RecruitmentField) {
  if (!field.options) field.options = [];
  field.options.push('');
  emitUpdate();
}

function removeOption(field: RecruitmentField, i: number) {
  field.options?.splice(i, 1);
  emitUpdate();
}

const TYPE_LABELS: Record<FieldType, string> = {
  text: '文本',
  number: '数字',
  range: '范围',
  boolean: '是/否',
  select: '下拉选择',
};
</script>

<template>
  <div class="rfe">
    <div v-if="fields.length === 0" class="rfe-empty">
      暂无招募字段，点击「添加字段」
    </div>

    <div v-for="(field, i) in fields" :key="i" class="rfe-card">
      <div class="rfe-card-header" @click="toggleField(i)">
        <span class="rfe-key">{{ field.key || '(未命名)' }}</span>
        <span class="rfe-label-text">{{ field.label }}</span>
        <span class="rfe-type-badge">{{ TYPE_LABELS[field.type] }}</span>
        <span v-if="field.required" class="rfe-required-badge">必填</span>
        <button class="rfe-rm-btn" @click.stop="removeField(i)">×</button>
      </div>

      <div v-if="expandedIdx === i" class="rfe-card-body">
        <!-- 行1：key / label / type -->
        <div class="rfe-row">
          <div class="rfe-field">
            <label class="rfe-lbl">字段 Key</label>
            <input v-model="field.key" class="rfe-input" placeholder="如 age" @input="emitUpdate" />
          </div>
          <div class="rfe-field">
            <label class="rfe-lbl">显示标签</label>
            <input v-model="field.label" class="rfe-input" placeholder="如 年龄" @input="emitUpdate" />
          </div>
          <div class="rfe-field rfe-field--sm">
            <label class="rfe-lbl">类型</label>
            <select v-model="field.type" class="rfe-select" @change="emitUpdate">
              <option v-for="(lbl, t) in TYPE_LABELS" :key="t" :value="t">{{ lbl }}</option>
            </select>
          </div>
          <div class="rfe-field rfe-field--sm rfe-field--check">
            <label class="rfe-checkbox-item">
              <input type="checkbox" v-model="field.required" @change="emitUpdate" />
              <span>必填</span>
            </label>
          </div>
        </div>

        <!-- 行2：placeholder / hint -->
        <div class="rfe-row">
          <div class="rfe-field rfe-field--flex">
            <label class="rfe-lbl">占位提示</label>
            <input v-model="field.placeholder" class="rfe-input" placeholder="(可选)" @input="emitUpdate" />
          </div>
          <div class="rfe-field rfe-field--flex">
            <label class="rfe-lbl">字段说明</label>
            <input v-model="field.hint" class="rfe-input" placeholder="(可选)" @input="emitUpdate" />
          </div>
        </div>

        <!-- 数字/范围：min/max -->
        <div v-if="field.type === 'number' || field.type === 'range'" class="rfe-row">
          <div class="rfe-field rfe-field--sm">
            <label class="rfe-lbl">最小值</label>
            <input v-model.number="field.min" type="number" class="rfe-input" @input="emitUpdate" />
          </div>
          <div class="rfe-field rfe-field--sm">
            <label class="rfe-lbl">最大值</label>
            <input v-model.number="field.max" type="number" class="rfe-input" @input="emitUpdate" />
          </div>
        </div>

        <!-- select：选项列表 -->
        <div v-if="field.type === 'select'" class="rfe-options">
          <div class="rfe-options-header">
            <span class="rfe-lbl">选项列表</span>
            <button class="rfe-add-opt-btn" @click="addOption(field)">+ 添加选项</button>
          </div>
          <div v-if="!field.options?.length" class="rfe-hint">暂无选项</div>
          <div v-for="(opt, oi) in field.options" :key="oi" class="rfe-opt-row">
            <input
              :value="opt"
              class="rfe-input"
              placeholder="选项值"
              @input="(e) => { field.options![oi] = (e.target as HTMLInputElement).value; emitUpdate(); }"
            />
            <button class="rfe-rm-btn" @click="removeOption(field, oi)">×</button>
          </div>
        </div>
      </div>
    </div>

    <button class="rfe-add-btn" @click="addField">+ 添加字段</button>
  </div>
</template>

<style scoped>
.rfe { display: flex; flex-direction: column; gap: 6px; }

.rfe-empty {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
}

.rfe-card {
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-card, #fff);
}

.rfe-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  background: var(--surface-base, #f9fafb);
  transition: background 0.1s;
}
.rfe-card-header:hover { background: var(--surface-hover, #f3f4f6); }

.rfe-key { font-size: 12px; font-weight: 600; color: var(--text-primary, #111); font-family: monospace; min-width: 60px; }
.rfe-label-text { font-size: 12px; color: var(--text-secondary, #6b7280); flex: 1; }
.rfe-type-badge { font-size: 11px; padding: 1px 6px; background: var(--color-accent, #7b68ee); color: #fff; border-radius: 4px; }
.rfe-required-badge { font-size: 11px; padding: 1px 6px; background: #ef4444; color: #fff; border-radius: 4px; }
.rfe-rm-btn { background: none; border: none; color: var(--text-secondary, #9ca3af); cursor: pointer; font-size: 15px; padding: 0 3px; transition: color 0.1s; }
.rfe-rm-btn:hover { color: #e74c3c; }

.rfe-card-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-default, #e5e7eb);
}

.rfe-row { display: flex; gap: 8px; flex-wrap: wrap; }
.rfe-field { display: flex; flex-direction: column; gap: 3px; }
.rfe-field--sm { min-width: 80px; }
.rfe-field--flex { flex: 1; min-width: 120px; }
.rfe-field--check { justify-content: flex-end; }

.rfe-lbl { font-size: 11px; color: var(--text-secondary, #6b7280); }

.rfe-input {
  padding: 4px 7px;
  border: 1px solid var(--border-default, #d1d5db);
  border-radius: 3px;
  font-size: 12px;
  background: var(--surface-card, #fff);
  color: var(--text-primary, #111);
}
.rfe-input:focus { outline: none; border-color: var(--color-accent, #7b68ee); }

.rfe-select {
  padding: 4px 6px;
  border: 1px solid var(--border-default, #d1d5db);
  border-radius: 3px;
  font-size: 12px;
  background: var(--surface-card, #fff);
  color: var(--text-primary, #111);
}

.rfe-checkbox-item { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }

.rfe-options { display: flex; flex-direction: column; gap: 4px; }
.rfe-options-header { display: flex; align-items: center; justify-content: space-between; }
.rfe-add-opt-btn {
  font-size: 11px; padding: 1px 7px;
  background: none; border: 1px solid var(--border-default, #d1d5db);
  border-radius: 3px; color: var(--text-secondary, #6b7280); cursor: pointer;
}
.rfe-add-opt-btn:hover { border-color: var(--color-accent, #7b68ee); color: var(--color-accent, #7b68ee); }

.rfe-opt-row { display: flex; gap: 4px; align-items: center; }
.rfe-hint { font-size: 11px; color: var(--text-secondary, #9ca3af); }

.rfe-add-btn {
  align-self: flex-start;
  padding: 5px 14px;
  background: var(--color-accent, #7b68ee);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.12s;
}
.rfe-add-btn:hover { opacity: 0.85; }
</style>
