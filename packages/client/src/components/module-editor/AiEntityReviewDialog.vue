<script setup lang="ts">
/**
 * AiEntityReviewDialog — AI 模组分析结果预览与确认
 *
 * 展示 AI 从文本中识别出的结构化实体（NPC、场景、线索、物品、事件），
 * 提供：
 *   - 按类型分组视图
 *   - 冲突检测（名称已存在于当前编辑内容中时标记 ⚠️）
 *   - 单条取消勾选
 *   - 全部确认写入 / 取消
 */
import { ref, computed, watch } from 'vue';
import type { ModuleEntity } from '../../api/modules';

export interface AiEntityReviewDialogProps {
  open: boolean;
  entities: ModuleEntity[];
  /** 当前模组内容（纯文本，用于冲突检测） */
  currentText?: string;
  busy?: boolean;
}

const props = withDefaults(defineProps<AiEntityReviewDialogProps>(), {
  currentText: '',
  busy: false,
});

const emit = defineEmits<{
  close: [];
  confirm: [selected: ModuleEntity[]];
}>();

// ── 实体选择状态 ─────────────────────────────────────────
const selected = ref<Set<number>>(new Set());

watch(() => props.entities, (entities) => {
  selected.value = new Set(entities.map((_, i) => i));
}, { immediate: true });

function toggle(idx: number) {
  if (selected.value.has(idx)) selected.value.delete(idx);
  else selected.value.add(idx);
}

function selectAll() {
  selected.value = new Set(props.entities.map((_, i) => i));
}

function deselectAll() {
  selected.value = new Set();
}

// ── 冲突检测 ─────────────────────────────────────────────
function isConflict(entity: ModuleEntity): boolean {
  if (!props.currentText) return false;
  return props.currentText.includes(entity.name);
}

// ── 分组 ─────────────────────────────────────────────────
const ENTITY_TYPE_LABELS: Record<string, string> = {
  npc: 'NPC',
  scene: '场景',
  clue: '线索',
  item: '物品',
  event: '事件',
};

interface GroupedEntity { idx: number; entity: ModuleEntity; conflict: boolean }
const groupedEntities = computed(() => {
  const map = new Map<string, GroupedEntity[]>();
  props.entities.forEach((entity, idx) => {
    const type = entity.type;
    if (!map.has(type)) map.set(type, []);
    map.get(type)!.push({ idx, entity, conflict: isConflict(entity) });
  });
  return map;
});

const selectedEntities = computed(() =>
  props.entities.filter((_, i) => selected.value.has(i)),
);

const conflictCount = computed(() =>
  props.entities.filter(isConflict).length,
);

// ── 确认 ─────────────────────────────────────────────────
function handleConfirm() {
  if (selectedEntities.value.length === 0) return;
  emit('confirm', selectedEntities.value);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="entity-review-overlay" @click.self="$emit('close')">
      <div class="entity-review-dialog">
        <header class="erd-header">
          <h2>AI 结构分析结果</h2>
          <button class="erd-close" @click="$emit('close')">×</button>
        </header>

        <div class="erd-meta">
          共识别 <strong>{{ entities.length }}</strong> 个实体
          <span v-if="conflictCount" class="erd-conflict-hint">
            ，其中 <strong>{{ conflictCount }}</strong> 个名称已存在于当前内容中（标记 ⚠️）
          </span>
        </div>

        <div class="erd-selection-bar">
          <button class="btn btn--sm btn--secondary" @click="selectAll">全选</button>
          <button class="btn btn--sm btn--secondary" @click="deselectAll">全不选</button>
          <span class="erd-selected-count">已选 {{ selected.size }} / {{ entities.length }}</span>
        </div>

        <div class="erd-body">
          <template v-for="[type, items] in groupedEntities" :key="type">
            <div class="erd-group">
              <div class="erd-group-title">
                {{ ENTITY_TYPE_LABELS[type] ?? type }}
                <span class="erd-group-count">({{ items.length }})</span>
              </div>
              <div class="erd-entity-list">
                <label
                  v-for="{ idx, entity, conflict } in items"
                  :key="idx"
                  class="erd-entity-row"
                  :class="{ 'erd-entity--conflict': conflict, 'erd-entity--unchecked': !selected.has(idx) }"
                >
                  <input
                    type="checkbox"
                    :checked="selected.has(idx)"
                    @change="toggle(idx)"
                  />
                  <div class="erd-entity-info">
                    <span class="erd-entity-name">
                      {{ entity.name }}
                      <span v-if="conflict" class="erd-conflict-badge" title="当前内容中已存在同名内容">⚠️ 已存在</span>
                    </span>
                    <span v-if="entity.description" class="erd-entity-desc">{{ entity.description }}</span>
                  </div>
                </label>
              </div>
            </div>
          </template>
        </div>

        <footer class="erd-footer">
          <button class="btn btn--secondary" @click="$emit('close')">取消</button>
          <button
            class="btn btn--primary"
            :disabled="busy || selected.size === 0"
            @click="handleConfirm"
          >
            {{ busy ? '写入中...' : `确认写入 ${selected.size} 项` }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.entity-review-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 2000;
  display: flex; align-items: center; justify-content: center;
}
.entity-review-dialog {
  background: var(--color-surface, #fff);
  border-radius: 10px;
  width: min(640px, 95vw);
  max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 40px rgba(0,0,0,.2);
}
.erd-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--color-border, #eee);
  h2 { margin: 0; font-size: 16px; }
}
.erd-close {
  background: none; border: none; font-size: 20px; cursor: pointer;
  color: var(--color-text-muted, #aaa); line-height: 1;
  &:hover { color: var(--color-text, #333); }
}
.erd-meta {
  padding: 10px 20px 6px;
  font-size: 13px; color: var(--color-text-secondary, #666);
}
.erd-conflict-hint { color: #d97706; }
.erd-selection-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 0 20px 8px;
  border-bottom: 1px solid var(--color-border, #eee);
}
.erd-selected-count {
  margin-left: auto; font-size: 12px; color: var(--color-text-muted, #aaa);
}
.erd-body {
  flex: 1; overflow-y: auto; padding: 12px 20px;
  display: flex; flex-direction: column; gap: 16px;
}
.erd-group-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  color: var(--color-text-secondary, #888); letter-spacing: .05em;
  margin-bottom: 8px;
}
.erd-group-count { font-weight: 400; }
.erd-entity-list { display: flex; flex-direction: column; gap: 6px; }
.erd-entity-row {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 8px 10px; border-radius: 6px;
  background: var(--color-input-bg, #f8f8f8);
  cursor: pointer;
  transition: background .1s;
  &:hover { background: var(--color-surface-hover, #f0f0f0); }
  input[type="checkbox"] { margin-top: 3px; flex-shrink: 0; }
}
.erd-entity--conflict { border-left: 3px solid #f59e0b; }
.erd-entity--unchecked { opacity: .5; }
.erd-entity-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.erd-entity-name { font-size: 13px; font-weight: 600; }
.erd-conflict-badge {
  margin-left: 6px; font-size: 11px; color: #d97706; font-weight: 400;
}
.erd-entity-desc {
  font-size: 12px; color: var(--color-text-muted, #aaa);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.erd-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border, #eee);
}
</style>
