<script setup lang="ts">
import { ref, watch } from 'vue';

type JsonLike = Record<string, unknown>;

const props = defineProps<{ modelValue: JsonLike }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: JsonLike): void }>();

const draft = ref(JSON.stringify(props.modelValue ?? {}, null, 2));

watch(
  () => props.modelValue,
  (value) => {
    draft.value = JSON.stringify(value ?? {}, null, 2);
  },
  { deep: true }
);

function applyDraft() {
  try {
    const parsed = JSON.parse(draft.value) as JsonLike;
    emit('update:modelValue', parsed);
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
      rows="10"
      spellcheck="false"
      placeholder="请输入角色卡 Schema JSON"
      @blur="applyDraft"
    />
    <p class="hint">失焦时自动解析 JSON 并同步到上层。</p>
  </div>
</template>

<style scoped>
.json-editor-wrapper {
  display: grid;
  gap: 8px;
}

.json-editor {
  width: 100%;
  min-height: 180px;
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
