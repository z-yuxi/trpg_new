<template>
  <node-view-wrapper as="span" class="npc-mention" :title="`实体 ID: ${node.attrs.id}`">
    <span class="npc-mention__inner">◆ {{ node.attrs.label || '未知 NPC' }}</span>
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
.npc-mention {
  display: inline;
  cursor: default;
  user-select: none;
}

.npc-mention__inner {
  display: inline-block;
  background: #FAF5FF;
  color: #9013FE;
  border: 1px solid #d9b0fc;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 0.875em;
  line-height: 1.4;
  vertical-align: baseline;
  transition: background 0.1s;
}

.npc-mention:hover .npc-mention__inner {
  background: #f3e8ff;
}
</style>
