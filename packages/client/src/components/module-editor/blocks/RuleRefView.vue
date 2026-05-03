<template>
  <node-view-wrapper as="span" class="rule-ref" :title="`规则引用: ${node.attrs.label}${node.attrs.value ? ' ' + node.attrs.value : ''}`">
    <span class="rule-ref__inner">[{{ node.attrs.label || '规则' }}{{ node.attrs.value ? ' ' + node.attrs.value : '' }}]</span>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3';

defineProps<{
  node: any;
  selected: boolean;
}>();
</script>

<style scoped>
.rule-ref {
  display: inline;
  cursor: default;
  user-select: none;
}

.rule-ref__inner {
  display: inline-block;
  background: transparent;
  color: #888;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 0.85em;
  line-height: 1.4;
  vertical-align: baseline;
  font-family: 'Courier New', monospace;
  transition: background 0.1s;
}

.rule-ref:hover .rule-ref__inner {
  background: #f5f5f5;
  color: #555;
}
</style>
