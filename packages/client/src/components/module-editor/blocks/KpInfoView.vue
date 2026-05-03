<template>
  <node-view-wrapper class="kp-info">
    <div class="kp-info__header">
      <span class="kp-info__marker">☆</span>
      <span class="kp-info__title">KP 信息</span>
      <button class="kp-info__del" title="删除块" @click="deleteNode">✕</button>
    </div>
    <node-view-content class="kp-info__content" />
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
.kp-info {
  border-left: 4px solid #F5A623;
  background: #FFFBF0;
  border: 1px dashed #F5A623;
  border-left-width: 4px;
  border-left-style: solid;
  border-radius: 0 6px 6px 0;
  margin: 8px 0;
}

.kp-info__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px dashed #F5A623;
}

.kp-info__marker {
  color: #F5A623;
  font-size: 14px;
  flex-shrink: 0;
}

.kp-info__title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #b07010;
  user-select: none;
}

.kp-info__del {
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

.kp-info:hover .kp-info__del {
  opacity: 1;
}

.kp-info__del:hover {
  color: #e53e3e;
}

.kp-info__content {
  padding: 8px 12px;
}
</style>
