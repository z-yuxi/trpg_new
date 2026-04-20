<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { StoryTime } from '@trpg/shared';
import { useAuthStore } from '../../stores/auth-store';

interface TrajectorySegment {
  scene_id: string;
  scene_name: string;
  from_time: StoryTime;
  to_time: StoryTime | null;
  move_type: string;
}

const props = defineProps<{
  campaignId: string;
  timeAxis: Array<{ day: number; hour: number }>;
  characters: Array<{ id: string; name: string }>;
  matrix: Record<string, TrajectorySegment[]>;
  currentTime: StoryTime;
  isGm?: boolean;
}>();

const authStore = useAuthStore();
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 900);
const filterCharId = ref('');
const selectedDetail = ref<{
  characterName: string;
  timeLabel: string;
  segment: TrajectorySegment;
} | null>(null);
const snapshotRows = ref<Array<{ characterName: string; sceneName: string; moveType: string }>>([]);
const showSnapshot = ref(false);

function toMinutes(t: StoryTime): number {
  return (t.day - 1) * 24 * 60 + t.hour * 60 + t.minute;
}

function hourToMinutes(day: number, hour: number): number {
  return (day - 1) * 24 * 60 + hour * 60;
}

function formatTime(t: StoryTime): string {
  return `第${t.day}天 ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

function formatAxis(day: number, hour: number): string {
  return `D${day} ${String(hour).padStart(2, '0')}:00`;
}

function sceneColor(sceneId: string): string {
  const palette = ['#5c9ded', '#5abf90', '#f0b34c', '#c77dff', '#ff7f7f', '#57c7d4', '#9c88ff', '#f68f6f'];
  let hash = 0;
  for (let i = 0; i < sceneId.length; i++) hash = ((hash << 5) - hash + sceneId.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function sceneShort(name: string): string {
  return name.length > 5 ? `${name.slice(0, 4)}…` : name;
}

function isMovingType(moveType: string): boolean {
  return moveType === 'scheduled' || moveType === 'force_move';
}

function moveIcon(moveType: string): string {
  if (moveType === 'scheduled') return '🚶';
  if (moveType === 'force_move') return '⚡';
  if (moveType === 'join') return '↗';
  if (moveType === 'leave') return '↘';
  return '•';
}

const visibleCharacters = computed(() => {
  if (!filterCharId.value) return props.characters;
  return props.characters.filter((c) => c.id === filterCharId.value);
});

function getSegmentAt(charId: string, day: number, hour: number): TrajectorySegment | null {
  const rows = props.matrix[charId] ?? [];
  const slotMin = hourToMinutes(day, hour);
  for (const seg of rows) {
    const fromMin = toMinutes(seg.from_time);
    const toMin = seg.to_time ? toMinutes(seg.to_time) : Number.POSITIVE_INFINITY;
    if (slotMin >= fromMin && slotMin < toMin) return seg;
  }
  return null;
}

function openDetail(charName: string, day: number, hour: number, segment: TrajectorySegment) {
  selectedDetail.value = {
    characterName: charName,
    timeLabel: formatAxis(day, hour),
    segment,
  };
}

function handleCellClick(charId: string, charName: string, day: number, hour: number) {
  const seg = getSegmentAt(charId, day, hour);
  if (seg) openDetail(charName, day, hour, seg);
}

async function handleCellContext(charId: string, charName: string, day: number, hour: number, segment: TrajectorySegment | null) {
  if (!props.isGm) return;
  if (segment) {
    try {
      await ElMessageBox.confirm(`将 ${charName} 强制移动到 ${segment.scene_name}？`, '强制移动', {
        confirmButtonText: '执行',
        cancelButtonText: '取消',
        type: 'warning',
      });
      const res = await fetch(`/api/campaigns/${props.campaignId}/moves/force`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({ character_id: charId, to_scene_id: segment.scene_id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? '强制移动失败');
      }
      ElMessage.success('已发起强制移动');
    } catch (err: any) {
      if (err?.message !== 'cancel') ElMessage.error(err?.message ?? '强制移动失败');
    }
    return;
  }

  const rows = visibleCharacters.value.map((char) => {
    const seg = getSegmentAt(char.id, day, hour);
    return {
      characterName: char.name,
      sceneName: seg?.scene_name ?? '未知/移动中',
      moveType: seg?.move_type ?? '-',
    };
  });
  snapshotRows.value = rows;
  showSnapshot.value = true;
}

const mobileColumns = computed(() => visibleCharacters.value.map((char) => ({
  ...char,
  segments: (props.matrix[char.id] ?? []).slice().sort((a, b) => toMinutes(a.from_time) - toMinutes(b.from_time)),
})));

function onResize() {
  isMobile.value = window.innerWidth < 900;
}

onMounted(() => {
  window.addEventListener('resize', onResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <div class="trajectory-matrix">
    <div class="toolbar">
      <select v-model="filterCharId" class="filter-select">
        <option value="">全部角色</option>
        <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <span class="toolbar-tip">左键看详情，GM 右键可强制移动或查看快照</span>
    </div>

    <div v-if="!isMobile" class="table-wrap">
      <table class="matrix-table">
        <thead>
          <tr>
            <th class="char-col sticky">角色</th>
            <th v-for="slot in timeAxis" :key="`${slot.day}-${slot.hour}`" class="time-col">{{ formatAxis(slot.day, slot.hour) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="char in visibleCharacters" :key="char.id">
            <td class="char-col sticky">{{ char.name }}</td>
            <td
              v-for="slot in timeAxis"
              :key="`${char.id}-${slot.day}-${slot.hour}`"
              class="cell"
              @click="handleCellClick(char.id, char.name, slot.day, slot.hour)"
              @contextmenu.prevent="handleCellContext(char.id, char.name, slot.day, slot.hour, getSegmentAt(char.id, slot.day, slot.hour))"
            >
              <div
                v-if="getSegmentAt(char.id, slot.day, slot.hour)"
                class="cell-chip"
                :style="{ backgroundColor: sceneColor(getSegmentAt(char.id, slot.day, slot.hour)?.scene_id ?? '') }"
                :class="{ moving: isMovingType(getSegmentAt(char.id, slot.day, slot.hour)?.move_type ?? '') }"
              >
                <span class="chip-icon">{{ moveIcon(getSegmentAt(char.id, slot.day, slot.hour)?.move_type ?? '') }}</span>
                <span class="chip-text">{{ sceneShort(getSegmentAt(char.id, slot.day, slot.hour)?.scene_name ?? '') }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="mobile-columns">
      <div v-for="char in mobileColumns" :key="char.id" class="mobile-col">
        <div class="mobile-char">{{ char.name }}</div>
        <div class="mobile-timeline">
          <div
            v-for="(seg, idx) in char.segments"
            :key="`${char.id}-${idx}`"
            class="mobile-seg"
            :class="{ moving: isMovingType(seg.move_type) }"
            :style="{ backgroundColor: sceneColor(seg.scene_id) }"
          >
            <div class="mobile-seg-title">{{ moveIcon(seg.move_type) }} {{ seg.scene_name }}</div>
            <div class="mobile-seg-time">{{ formatTime(seg.from_time) }} - {{ seg.to_time ? formatTime(seg.to_time) : '进行中' }}</div>
          </div>
          <div v-if="char.segments.length === 0" class="mobile-empty">暂无记录</div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="selectedDetail" class="dlg-overlay" @click.self="selectedDetail=null">
        <div class="dlg-panel">
          <div class="dlg-title">轨迹详情</div>
          <div class="detail-row"><span>角色</span><strong>{{ selectedDetail.characterName }}</strong></div>
          <div class="detail-row"><span>时间切片</span><strong>{{ selectedDetail.timeLabel }}</strong></div>
          <div class="detail-row"><span>场景</span><strong>{{ selectedDetail.segment.scene_name }}</strong></div>
          <div class="detail-row"><span>进入时间</span><strong>{{ formatTime(selectedDetail.segment.from_time) }}</strong></div>
          <div class="detail-row"><span>离开时间</span><strong>{{ selectedDetail.segment.to_time ? formatTime(selectedDetail.segment.to_time) : '进行中' }}</strong></div>
          <div class="detail-row"><span>移动方式</span><strong>{{ selectedDetail.segment.move_type }}</strong></div>
          <div class="dlg-footer"><button class="dlg-btn" @click="selectedDetail=null">关闭</button></div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showSnapshot" class="dlg-overlay" @click.self="showSnapshot=false">
        <div class="dlg-panel">
          <div class="dlg-title">时间点位置快照</div>
          <div v-for="row in snapshotRows" :key="row.characterName" class="detail-row">
            <span>{{ row.characterName }}</span>
            <strong>{{ row.sceneName }} ({{ row.moveType }})</strong>
          </div>
          <div class="dlg-footer"><button class="dlg-btn" @click="showSnapshot=false">关闭</button></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.trajectory-matrix { padding: var(--space-3); }
.toolbar { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); flex-wrap: wrap; }
.filter-select { padding: 4px 8px; border: 1px solid var(--color-input-border); border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm); }
.toolbar-tip { font-size: var(--text-xs); color: var(--color-text-muted); }

.table-wrap { overflow: auto; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); max-height: 420px; }
.matrix-table { border-collapse: collapse; font-size: var(--text-xs); min-width: 900px; width: max-content; }
.matrix-table th, .matrix-table td { border: 1px solid var(--color-card-border); padding: 4px; text-align: center; }
.char-col { min-width: 96px; text-align: left; background: var(--surface-card); font-weight: 600; }
.time-col { min-width: 72px; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 11px; background: var(--surface-card); }
.sticky { position: sticky; left: 0; z-index: 2; }
.cell { min-width: 72px; height: 34px; cursor: pointer; }
.cell-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #fff;
  font-weight: 600;
  border-radius: 6px;
  padding: 2px 4px;
  line-height: 1;
}
.cell-chip.moving {
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.18) 0,
    rgba(255, 255, 255, 0.18) 4px,
    rgba(255, 255, 255, 0) 4px,
    rgba(255, 255, 255, 0) 8px
  );
}
.chip-icon { font-size: 10px; }
.chip-text { font-size: 11px; }

.mobile-columns { display: flex; gap: var(--space-3); overflow-x: auto; padding-bottom: var(--space-1); }
.mobile-col { min-width: 78vw; max-width: 86vw; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); padding: var(--space-2); background: var(--surface-card); }
.mobile-char { font-weight: 600; margin-bottom: var(--space-2); }
.mobile-timeline { display: flex; flex-direction: column; gap: var(--space-2); }
.mobile-seg { border-radius: 8px; color: #fff; padding: var(--space-2); }
.mobile-seg.moving {
  background-image: repeating-linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.18) 0,
    rgba(255, 255, 255, 0.18) 5px,
    rgba(255, 255, 255, 0) 5px,
    rgba(255, 255, 255, 0) 10px
  );
}
.mobile-seg-title { font-size: var(--text-sm); font-weight: 600; }
.mobile-seg-time { font-size: 11px; opacity: 0.92; margin-top: 2px; }
.mobile-empty { color: var(--color-text-muted); font-size: var(--text-xs); }

.dlg-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 2500; display: flex; align-items: center; justify-content: center; }
.dlg-panel { width: min(460px, calc(100vw - 32px)); background: var(--surface-card); border-radius: 12px; padding: var(--space-4); border: 1px solid var(--color-card-border); }
.dlg-title { font-size: var(--text-base); font-weight: 700; margin-bottom: var(--space-3); }
.detail-row { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--text-sm); margin-bottom: var(--space-2); }
.dlg-footer { display: flex; justify-content: flex-end; margin-top: var(--space-3); }
.dlg-btn { border: 1px solid var(--color-card-border); background: var(--color-page-bg); padding: 6px 14px; border-radius: var(--radius-md); cursor: pointer; }
</style>
