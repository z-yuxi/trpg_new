<template>
  <div v-if="open && preview" class="import-dialog-backdrop" @click.self="emit('close')">
    <section class="import-dialog">
      <header class="import-dialog__header">
        <div>
          <h3 class="import-dialog__title">确认导入内容</h3>
          <p class="import-dialog__meta">将覆盖当前模组正文，请确认标题和摘要。</p>
        </div>
        <button class="import-dialog__close" type="button" @click="emit('close')">关闭</button>
      </header>

      <div class="import-dialog__body">
        <label class="import-dialog__field">
          <span>模组标题</span>
          <input v-model="draftName" class="import-dialog__input" type="text" />
        </label>

        <label class="import-dialog__field">
          <span>摘要</span>
          <textarea v-model="draftDescription" class="import-dialog__textarea" rows="3" />
        </label>

        <div class="import-dialog__stats">
          <span>字数：{{ preview.word_count }}</span>
          <span>预览文本仅用于确认，保存后会转成编辑器文档。</span>
        </div>

        <div class="import-dialog__preview">{{ preview.plain_text || '文件内容为空。' }}</div>
      </div>

      <footer class="import-dialog__footer">
        <button class="btn btn--secondary" type="button" @click="emit('close')">取消</button>
        <button class="btn btn--primary" type="button" :disabled="busy" @click="confirmImport">
          {{ busy ? '导入中...' : '确认导入' }}
        </button>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface ImportPreview {
  name: string;
  description: string;
  content: string;
  plain_text: string;
  word_count: number;
}

const props = defineProps<{
  open: boolean;
  preview: ImportPreview | null;
  busy?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [{ name: string; description: string; content: string; word_count: number }];
}>();

const draftName = ref('');
const draftDescription = ref('');

watch(
  () => props.preview,
  (preview) => {
    draftName.value = preview?.name ?? '';
    draftDescription.value = preview?.description ?? '';
  },
  { immediate: true },
);

function confirmImport() {
  if (!props.preview) return;
  emit('confirm', {
    name: draftName.value.trim() || props.preview.name,
    description: draftDescription.value.trim(),
    content: props.preview.content,
    word_count: props.preview.word_count,
  });
}
</script>

<style scoped>
.import-dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 30;
}

.import-dialog {
  width: min(760px, 100%);
  max-height: min(760px, 100vh - 48px);
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 16px;
  box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.import-dialog__header,
.import-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-default, #e5e7eb);
}

.import-dialog__footer {
  border-bottom: none;
  border-top: 1px solid var(--border-default, #e5e7eb);
  justify-content: flex-end;
}

.import-dialog__title {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary, #111827);
}

.import-dialog__meta {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
}

.import-dialog__close {
  border: none;
  background: transparent;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
}

.import-dialog__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
}

.import-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--text-body, #374151);
  font-size: 13px;
}

.import-dialog__input,
.import-dialog__textarea,
.import-dialog__preview {
  border: 1px solid var(--border-default, #e5e7eb);
  border-radius: 10px;
  background: var(--surface-page, #f9fafb);
  color: var(--text-primary, #111827);
}

.import-dialog__input,
.import-dialog__textarea {
  padding: 10px 12px;
  font: inherit;
}

.import-dialog__preview {
  min-height: 240px;
  max-height: 360px;
  padding: 14px;
  white-space: pre-wrap;
  overflow: auto;
  line-height: 1.6;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
}

.import-dialog__stats {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

@media (max-width: 768px) {
  .import-dialog-backdrop {
    padding: 12px;
  }

  .import-dialog__header,
  .import-dialog__footer,
  .import-dialog__body {
    padding: 14px;
  }

  .import-dialog__stats {
    flex-direction: column;
  }
}
</style>