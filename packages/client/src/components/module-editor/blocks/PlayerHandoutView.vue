<template>
  <node-view-wrapper class="p-handout">
    <div class="p-handout__header">
      <span class="p-handout__marker">【】</span>
      <input
        class="p-handout__title-input"
        :value="node.attrs.label || ''"
        placeholder="玩家资料标题…"
        @input="updateAttributes({ label: ($event.target as HTMLInputElement).value })"
        @mousedown.stop
        @keydown.enter.prevent
      />
      <button
        class="p-handout__distribute-btn"
        :class="{ 'p-handout__distribute-btn--done': node.attrs.distributed }"
        title="标记为已发放"
        @click="toggleDistributed"
        @mousedown.stop
      >{{ node.attrs.distributed ? '✓ 已发放' : '发放' }}</button>
      <button class="p-handout__del" title="删除节点" @click="deleteNode">✕</button>
    </div>
    <node-view-content class="p-handout__content" />
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';

const props = defineProps<{
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
}>();

function toggleDistributed() {
  props.updateAttributes({ distributed: !props.node.attrs.distributed });
}
</script>

<style scoped>
.p-handout {
  border-left: 4px solid #F5A623;
  background: #FFFBF0;
  border-radius: 0 6px 6px 0;
  margin: 8px 0;
  padding: 0;
  border: 1px solid #F5E4B0;
  border-left-width: 4px;
}

.p-handout__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid #F5E4B0;
}

.p-handout__marker {
  color: #F5A623;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.p-handout__title-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: #5a3e00;
  outline: none;
  min-width: 0;
}

.p-handout__title-input::placeholder {
  color: #c9a95a;
  font-weight: 400;
}

.p-handout__distribute-btn {
  background: none;
  border: 1px solid #F5A623;
  border-radius: 4px;
  cursor: pointer;
  color: #F5A623;
  font-size: 11px;
  padding: 1px 7px;
  flex-shrink: 0;
  transition: all 0.15s;
}

.p-handout__distribute-btn--done {
  background: #F5A623;
  color: #fff;
}

.p-handout__del {
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  padding: 0 4px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.p-handout:hover .p-handout__del {
  opacity: 1;
}

.p-handout__content {
  padding: 8px 12px;
  outline: none;
}
</style>
