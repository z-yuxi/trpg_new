<template>
  <node-view-wrapper class="inv-node">
    <div class="inv-node__header">
      <span class="inv-node__marker">▼</span>
      <input
        class="inv-node__title-input"
        :value="node.attrs.label || ''"
        placeholder="输入节点标题…"
        @input="updateAttributes({ label: ($event.target as HTMLInputElement).value })"
        @mousedown.stop
        @keydown.enter.prevent
      />
      <button class="inv-node__del" title="删除节点" @click="deleteNode">✕</button>
    </div>
    <node-view-content class="inv-node__content" />
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
.inv-node {
  border-left: 4px solid #4A90D9;
  background: #F5F9FF;
  border-radius: 0 6px 6px 0;
  margin: 8px 0;
  padding: 0;
}

.inv-node__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid #D6E8F8;
}

.inv-node__marker {
  color: #4A90D9;
  font-size: 12px;
  flex-shrink: 0;
}

.inv-node__title-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: #1a2940;
  outline: none;
  min-width: 0;
}

.inv-node__title-input::placeholder {
  color: #a0b8d0;
  font-weight: 400;
}

.inv-node__del {
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  padding: 0 4px;
  font-size: 12px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.15s;
}

.inv-node:hover .inv-node__del {
  opacity: 1;
}

.inv-node__del:hover {
  color: #e53e3e;
}

.inv-node__content {
  padding: 8px 12px;
}
</style>
