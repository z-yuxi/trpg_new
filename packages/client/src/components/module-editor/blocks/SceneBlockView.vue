<template>
  <node-view-wrapper class="block-view block-view--scene">
    <div class="block-header" @click="toggleCollapse">
      <span class="block-icon">📍</span>
      <span class="block-title">{{ attrs.scene_name || '未命名场景' }}</span>
      <span class="block-tag">场景</span>
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

const props = defineProps<{
  node: any;
  updateAttributes: (attrs: Record<string, unknown>) => void;
}>();

const attrs = computed(() => props.node.attrs as Record<string, unknown>);
const isCollapsed = computed(() => !!attrs.value['collapsed']);

function toggleCollapse() {
  props.updateAttributes({ collapsed: !isCollapsed.value });
}
</script>

<style scoped>
.block-view--scene { border-left: 4px solid var(--color-success, #4caf50); }
</style>
