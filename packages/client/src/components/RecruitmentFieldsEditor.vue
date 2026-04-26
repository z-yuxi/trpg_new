<script setup lang="ts">
import { ref, watch } from 'vue';

type JsonArray = Array<Record<string, unknown>>;

const props = defineProps<{ modelValue: JsonArray }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: JsonArray): void }>();

const draft = ref(JSON.stringify(props.modelValue ?? [], null, 2));

watch(
  () => props.modelValue,
  (value) => {
    draft.value = JSON.stringify(value ?? [], null, 2);
  },
  { deep: true }
);

function applyDraft() {
  try {
    const parsed = JSON.parse(draft.value);
    if (Array.isArray(parsed)) {
      emit('update:modelValue', parsed as JsonArray);
    }
  } catch {
    // keep draft text to allow users fixing invalid JSON manually
  }
}
</script>

<template>
  <div class="json-editor-wrapper">
    <textarea
      v-model="draft"
      class="json-editor"
      rows="8"
      spellcheck="false"
      placeholder="请输入招募字段数组 JSON"
      @blur="applyDraft"
    />
    <p class="hint">建议结构示例：[{"name":"偏好时间","type":"text"}]</p>
  </div>
</template>

<style scoped>
.json-editor-wrapper {
  display: grid;
  gap: 8px;
}

.json-editor {
  width: 100%;
  min-height: 150px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--surface-elevated);
  color: var(--text-primary);
  padding: 10px 12px;
  font-family: var(--font-mono, Consolas, monospace);
  font-size: 13px;
}

.hint {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
