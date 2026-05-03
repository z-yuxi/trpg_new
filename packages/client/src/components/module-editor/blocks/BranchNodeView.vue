<template>
  <node-view-wrapper class="branch-node">
    <div class="branch-node__header">
      <span class="branch-node__marker">▸</span>
      <input
        class="branch-node__condition-input"
        :value="node.attrs.condition || ''"
        placeholder="条件（如：侦查成功 / 失败）…"
        @input="updateAttributes({ condition: ($event.target as HTMLInputElement).value })"
        @mousedown.stop
        @keydown.enter.prevent
      />
      <button class="branch-node__del" title="删除节点" @click="deleteNode">✕</button>
    </div>
    <node-view-content class="branch-node__content" />
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
.branch-node {
  border-left: 4px solid #50C878;
  background: #F5FFF8;
  border-radius: 0 6px 6px 0;
  margin: 6px 0;
  padding: 0;
}

.branch-node__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid #C3EED0;
}

.branch-node__marker {
  color: #50C878;
  font-size: 13px;
  flex-shrink: 0;
}

.branch-node__condition-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: #0a3320;
  outline: none;
  min-width: 0;
}

.branch-node__condition-input::placeholder {
  color: #7ec99a;
  font-weight: 400;
}

.branch-node__del {
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  padding: 0 4px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.branch-node:hover .branch-node__del {
  opacity: 1;
}

.branch-node__content {
  padding: 6px 10px;
  outline: none;
}
</style>
