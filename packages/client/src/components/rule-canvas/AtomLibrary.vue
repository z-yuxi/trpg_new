<script setup lang="ts">
import { ref, computed } from 'vue';
import { ATOM_DEFINITIONS } from '../../utils/canvas-serializer';
import type { AtomDef } from '../../utils/canvas-serializer';

const emit = defineEmits<{
  (e: 'add-node', atomType: string): void;
}>();

const searchQuery = ref('');

const categories: { key: string; label: string }[] = [
  { key: 'data', label: '数据读取' },
  { key: 'compute', label: '计算' },
  { key: 'logic', label: '逻辑' },
  { key: 'effect', label: '效果' },
  { key: 'table', label: '查表' },
  { key: 'output', label: '输出' },
];

const filteredAtoms = computed(() => {
  const q = searchQuery.value.toLowerCase();
  return Object.values(ATOM_DEFINITIONS).filter(
    (a) =>
      !q ||
      a.label.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.atom_type.toLowerCase().includes(q),
  );
});

function getByCategory(catKey: string): AtomDef[] {
  return filteredAtoms.value.filter((a) => a.category === catKey);
}

// ── 拖拽到画布 ────────────────────────────────────────────────────────────
function onDragStart(event: DragEvent, atomType: string) {
  event.dataTransfer!.effectAllowed = 'copy';
  event.dataTransfer!.setData('application/atom-type', atomType);
}

const categoryColors: Record<string, string> = {
  data: '#4a90e2',
  compute: '#7b68ee',
  logic: '#f39c12',
  effect: '#e74c3c',
  table: '#8e44ad',
  output: '#27ae60',
};
</script>

<template>
  <div class="atom-library">
    <div class="atom-library__header">
      <h4 class="atom-library__title">原子节点库</h4>
      <input
        v-model="searchQuery"
        class="atom-library__search"
        placeholder="搜索节点…"
      />
    </div>

    <div class="atom-library__body">
      <template v-for="cat in categories" :key="cat.key">
        <div v-if="getByCategory(cat.key).length > 0" class="atom-library__category">
          <div class="atom-library__cat-label" :style="{ color: categoryColors[cat.key] }">
            {{ cat.label }}
          </div>

          <div
            v-for="atom in getByCategory(cat.key)"
            :key="atom.atom_type"
            class="atom-card"
            :style="{ '--cat-color': categoryColors[cat.key] }"
            draggable="true"
            @dragstart="onDragStart($event, atom.atom_type)"
            :title="'拖拽到画布添加'"
          >
            <span class="atom-card__icon">{{ atom.icon }}</span>
            <div class="atom-card__info">
              <span class="atom-card__label">{{ atom.label }}</span>
              <span class="atom-card__desc">{{ atom.description }}</span>
            </div>
          </div>
        </div>
      </template>

      <div v-if="filteredAtoms.length === 0" class="atom-library__empty">
        无匹配节点
      </div>
    </div>

    <div class="atom-library__tips">
      <p>拖拽节点到画布即可添加</p>
      <p>从输出端口拖向输入端口可连线</p>
    </div>
  </div>
</template>

<style scoped>
.atom-library {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-sidebar, #16161e);
  border-right: 1px solid var(--color-border, #2a2a3e);
  overflow: hidden;
}

.atom-library__header {
  padding: 12px;
  border-bottom: 1px solid var(--color-border, #2a2a3e);
}

.atom-library__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #e0e0e0);
  margin: 0 0 8px;
}

.atom-library__search {
  width: 100%;
  padding: 5px 8px;
  background: var(--color-bg-input, #2a2a3e);
  border: 1px solid var(--color-border, #3a3a4e);
  border-radius: 4px;
  color: var(--color-text-primary, #e0e0e0);
  font-size: 12px;
  box-sizing: border-box;
}

.atom-library__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.atom-library__category {
  margin-bottom: 12px;
}

.atom-library__cat-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 4px 6px;
  opacity: 0.9;
}

.atom-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-left: 3px solid var(--cat-color, #888);
  border-radius: 4px;
  background: var(--color-bg-card, #1e1e2e);
  cursor: grab;
  transition: background 0.12s, border-color 0.12s;
}

.atom-card:hover {
  background: color-mix(in srgb, var(--cat-color) 12%, var(--color-bg-card, #1e1e2e));
  border-color: var(--cat-color, #888);
}

.atom-card:active { cursor: grabbing; }

.atom-card__icon {
  font-size: 18px;
  line-height: 1;
  margin-top: 1px;
}

.atom-card__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.atom-card__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-primary, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.atom-card__desc {
  font-size: 11px;
  color: var(--color-text-secondary, #888);
  line-height: 1.3;
}

.atom-library__empty {
  text-align: center;
  padding: 24px 0;
  color: var(--color-text-secondary, #888);
  font-size: 13px;
}

.atom-library__tips {
  padding: 8px 12px;
  border-top: 1px solid var(--color-border, #2a2a3e);
  font-size: 11px;
  color: var(--color-text-secondary, #666);
  line-height: 1.6;
}

.atom-library__tips p { margin: 0; }
</style>
