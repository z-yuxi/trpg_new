<template>
  <node-view-wrapper class="block-view block-view--event">
    <div class="block-header" @click="toggleCollapse">
      <span class="block-icon">⚡</span>
      <span class="block-title">{{ attrs.event_name || '未命名事件' }}</span>
      <span class="block-tag">事件</span>
      <span class="collapse-btn">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>
    <div v-if="!isCollapsed" class="block-body">
      <node-view-content class="block-content" />
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3';

const props = defineProps<{ node: any; updateAttributes: (a: Record<string, unknown>) => void }>();
const attrs = computed(() => props.node.attrs as Record<string, unknown>);
const isCollapsed = computed(() => !!attrs.value['collapsed']);
function toggleCollapse() { props.updateAttributes({ collapsed: !isCollapsed.value }); }
</script>

<style scoped>
.block-view--event { border-left: 4px solid var(--color-primary, #1976d2); }
</style>
