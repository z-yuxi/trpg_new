<template>
  <div class="snapshot-timeline">
    <div class="snapshot-header">
      <span class="snapshot-title">历史版本</span>
      <span class="snapshot-hint">最多保留 3 个版本</span>
    </div>

    <div v-if="loading" class="snapshot-loading">
      <span>加载中…</span>
    </div>

    <div v-else-if="snapshots.length === 0" class="snapshot-empty">
      <span>暂无历史版本</span>
    </div>

    <div v-else class="snapshot-list">
      <div
        v-for="snapshot in snapshots"
        :key="snapshot.id"
        class="snapshot-item"
        :class="{ 'snapshot-item--active': activeId === snapshot.id }"
      >
        <div class="snapshot-item-dot" />
        <div class="snapshot-item-info">
          <span class="snapshot-item-version">v{{ snapshot.version_number }}</span>
          <span class="snapshot-item-time">{{ formatTime(snapshot.created_at) }}</span>
        </div>
        <button
          class="snapshot-rollback-btn"
          :disabled="rolling === snapshot.id"
          @click="$emit('rollback', snapshot.id)"
          title="回滚到此版本"
        >
          <template v-if="rolling === snapshot.id">回滚中…</template>
          <template v-else>回滚</template>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { type ModuleSnapshot } from '../../api/modules';

const props = defineProps<{
  snapshots: ModuleSnapshot[];
  loading?: boolean;
  rolling?: string | null;
  activeId?: string | null;
}>();

defineEmits<{
  (e: 'rollback', snapshotId: string): void;
}>();

function formatTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<style scoped>
.snapshot-timeline {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  background: var(--surface-card);
  border-top: 1px solid var(--border-default);
  font-size: 13px;
}

.snapshot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.snapshot-title {
  font-weight: 600;
  color: var(--color-text, #333);
}

.snapshot-hint {
  font-size: 11px;
  color: var(--color-text-secondary, #888);
}

.snapshot-loading,
.snapshot-empty {
  padding: 6px 0;
  color: var(--color-text-secondary, #888);
  text-align: center;
  font-size: 12px;
}

.snapshot-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.snapshot-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--border-default);
  border-radius: 20px;
  background: var(--surface-page);
  transition: background 0.15s, border-color 0.15s;
}

.snapshot-item--active {
  border-color: var(--color-primary, #4a6fa5);
  background: rgba(74, 111, 165, 0.06);
}

.snapshot-item-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-secondary, #bbb);
  flex-shrink: 0;
}

.snapshot-item--active .snapshot-item-dot {
  background: var(--color-primary, #4a6fa5);
}

.snapshot-item-info {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.snapshot-item-version {
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text, #333);
}

.snapshot-item-time {
  font-size: 11px;
  color: var(--color-text-secondary, #888);
}

.snapshot-rollback-btn {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: var(--color-text, #555);
  transition: background 0.12s, color 0.12s;
  white-space: nowrap;
}

.snapshot-rollback-btn:hover:not(:disabled) {
  background: var(--color-primary, #4a6fa5);
  color: #fff;
  border-color: var(--color-primary, #4a6fa5);
}

.snapshot-rollback-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
