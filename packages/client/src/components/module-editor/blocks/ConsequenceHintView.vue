<template>
  <node-view-wrapper class="conseq-hint">
    <div class="conseq-hint__header">
      <span class="conseq-hint__marker">▶</span>
      <input
        class="conseq-hint__condition-input"
        :value="node.attrs.condition || ''"
        placeholder="触发条件…"
        @input="updateAttributes({ condition: ($event.target as HTMLInputElement).value })"
        @mousedown.stop
        @keydown.enter.prevent
      />
      <button class="conseq-hint__del" title="删除节点" @click="deleteNode">✕</button>
    </div>
    <node-view-content class="conseq-hint__content" />
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';

defineProps<{
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
}>();
</script>

<style scoped>
.conseq-hint {
  border-left: 4px solid #4A90D9;
  background: transparent;
  border-radius: 0 4px 4px 0;
  margin: 6px 0;
  padding: 0;
}

.conseq-hint__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid #D6E8F8;
}

.conseq-hint__marker {
  color: #4A90D9;
  font-size: 12px;
  flex-shrink: 0;
}

.conseq-hint__condition-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: #1a2940;
  outline: none;
  min-width: 0;
}

.conseq-hint__condition-input::placeholder {
  color: #a0b8d0;
  font-weight: 400;
}

.conseq-hint__del {
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  padding: 0 4px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.conseq-hint:hover .conseq-hint__del {
  opacity: 1;
}

.conseq-hint__content {
  padding: 6px 10px;
  outline: none;
}
</style>
