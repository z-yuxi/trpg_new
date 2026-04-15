<script setup lang="ts">
import { computed, ref } from 'vue';
import type { PositionHistory, Scene, StoryTime } from '@trpg/shared';

const props = defineProps<{
  positionHistory: PositionHistory[];
  scenes: Scene[];
  characters: { id: string; name: string }[];
  currentTime: StoryTime;
}>();

const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 768);
const filterCharId = ref('');
const showHours = ref(24);

function getSceneName(id: string) {
  return props.scenes.find(s => s.id === id)?.name ?? id;
}

function formatTime(st: StoryTime) {
  return `Day ${st.day} ${String(st.hour).padStart(2, '0')}:${String(st.minute).padStart(2, '0')}`;
}

const filteredHistory = computed(() => {
  let h = props.positionHistory;
  if (filterCharId.value) h = h.filter(p => p.character_id === filterCharId.value);
  return h;
});

// 按角色分组历史
const byChar = computed(() => {
  const map = new Map<string, PositionHistory[]>();
  for (const record of filteredHistory.value) {
    const list = map.get(record.character_id) ?? [];
    list.push(record);
    map.set(record.character_id, list);
  }
  return map;
});

// 时间线事件（移动端用）
const timelineEvents = computed(() => {
  return filteredHistory.value
    .map(p => ({
      charName: props.characters.find(c => c.id === p.character_id)?.name ?? p.character_id,
      sceneName: getSceneName(p.scene_id),
      time: p.story_time_entered as unknown as StoryTime,
      moveType: p.move_type,
    }))
    .sort((a, b) => {
      if (!a.time || !b.time) return 0;
      return (a.time.day * 1440 + a.time.hour * 60 + a.time.minute) -
             (b.time.day * 1440 + b.time.hour * 60 + b.time.minute);
    });
});
</script>

<template>
  <div class="trajectory-matrix">
    <!-- 工具栏 -->
    <div class="toolbar">
      <select v-model="filterCharId" class="filter-select">
        <option value="">全部角色</option>
        <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="showHours" class="filter-select">
        <option :value="6">最近 6 小时</option>
        <option :value="24">最近 24 小时</option>
        <option :value="72">最近 3 天</option>
      </select>
    </div>

    <!-- 桌面端：表格视图 -->
    <div v-if="!isMobile" class="table-wrap">
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="char-col">角色</th>
            <th v-for="scene in scenes" :key="scene.id" class="scene-col">{{ scene.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="char in characters" :key="char.id">
            <td class="char-col">{{ char.name }}</td>
            <td v-for="scene in scenes" :key="scene.id" class="scene-cell">
              <span v-if="byChar.get(char.id)?.some(p => p.scene_id === scene.id)" class="presence-dot" />
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="filteredHistory.length === 0" class="empty">暂无轨迹数据</div>
    </div>

    <!-- 移动端：时间线视图 -->
    <div v-else class="timeline">
      <div v-for="(evt, i) in timelineEvents" :key="i" class="timeline-item">
        <div class="timeline-time">{{ formatTime(evt.time) }}</div>
        <div class="timeline-content">
          <span class="timeline-char">{{ evt.charName }}</span>
          <span class="timeline-arrow">→</span>
          <span class="timeline-scene">{{ evt.sceneName }}</span>
          <span class="timeline-type">({{ evt.moveType }})</span>
        </div>
      </div>
      <div v-if="timelineEvents.length === 0" class="empty">暂无轨迹数据</div>
    </div>
  </div>
</template>

<style scoped>
.trajectory-matrix { padding: var(--space-3); }
.toolbar { display: flex; gap: var(--space-3); margin-bottom: var(--space-4); flex-wrap: wrap; }
.filter-select { padding: 4px 8px; border: 1px solid var(--color-input-border); border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm); }
.table-wrap { overflow-x: auto; }
.matrix-table { border-collapse: collapse; font-size: var(--text-sm); min-width: 600px; }
.matrix-table th, .matrix-table td { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-card-border); text-align: center; }
.char-col { text-align: left; font-weight: 600; min-width: 100px; }
.scene-col { font-size: var(--text-xs); color: var(--color-text-secondary); }
.presence-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--color-accent); }
.timeline { display: flex; flex-direction: column; gap: var(--space-3); }
.timeline-item { display: flex; gap: var(--space-3); align-items: baseline; }
.timeline-time { font-size: var(--text-xs); color: var(--color-text-muted); font-family: var(--font-mono); width: 120px; flex-shrink: 0; }
.timeline-content { font-size: var(--text-sm); }
.timeline-char { font-weight: 600; }
.timeline-arrow { margin: 0 4px; color: var(--color-text-muted); }
.timeline-scene { color: var(--color-accent); }
.timeline-type { font-size: var(--text-xs); color: var(--color-text-muted); margin-left: 4px; }
.empty { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-6); }
</style>
