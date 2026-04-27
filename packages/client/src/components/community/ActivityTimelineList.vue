<script setup lang="ts">
import TTag from '../base/TTag.vue';
import EmptyState from '../base/EmptyState.vue';

interface ActivityTimelineItem {
  id: string;
  title: string;
  createdAtText: string;
  tagText: string;
  targetId: string;
  preview?: string;
}

const props = defineProps<{
  items: ActivityTimelineItem[];
  emptyTitle: string;
  emptyDescription: string;
}>();

const emit = defineEmits<{
  open: [targetId: string];
}>();

function handleOpen(targetId: string) {
  emit('open', targetId);
}
</script>

<template>
  <EmptyState
    v-if="props.items.length === 0"
    icon-name=""
    illustration-name="illust-empty"
    :illustration-size="170"
    :title="props.emptyTitle"
    :description="props.emptyDescription"
  />

  <div v-else class="timeline">
    <div v-for="(item, index) in props.items" :key="item.id" class="timeline-item">
      <div class="timeline-axis">
        <div class="axis-dot"></div>
        <div v-if="index < props.items.length - 1" class="axis-line"></div>
      </div>

      <div class="timeline-content">
        <div class="item-header">
          <TTag color="default" size="sm">{{ item.tagText }}</TTag>
          <span class="item-time">{{ item.createdAtText }}</span>
        </div>
        <div class="item-title clickable" @click="handleOpen(item.targetId)">{{ item.title }}</div>
        <div v-if="item.preview" class="reply-preview">{{ item.preview }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.timeline { display: flex; flex-direction: column; }

.timeline-item {
  display: flex;
  gap: var(--space-4);
}

.timeline-axis {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 16px;
}

.axis-dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  border: 2px solid var(--surface-page);
  box-shadow: 0 0 0 2px var(--color-primary);
  flex-shrink: 0;
  margin-top: 4px;
}

.axis-line {
  width: 2px;
  flex: 1;
  background: var(--border-default);
  min-height: 24px;
  margin: var(--space-1) 0;
}

.timeline-content {
  flex: 1;
  padding-bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.item-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.item-time {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.item-title {
  font-size: var(--text-sm);
  color: var(--text-body);
  line-height: var(--leading-normal);
}

.item-title.clickable {
  cursor: pointer;
}

.item-title.clickable:hover {
  color: var(--color-primary);
}

.reply-preview {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: var(--leading-normal);
}
</style>
