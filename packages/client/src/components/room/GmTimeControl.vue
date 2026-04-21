<script setup lang="ts">
import { ref } from 'vue';
import { ElDialog, ElMessage } from 'element-plus';
import { socketClient } from '../../socket/socket-client';
import { api } from '../../utils/api';
import type { StoryTime } from '@trpg/shared';

const props = defineProps<{
  campaignId: string;
  globalStoryTime: StoryTime;
}>();

function padZ(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function formatTime(t: StoryTime) { return `第${t.day}日 ${padZ(t.hour)}:${padZ(t.minute)}`; }

const showTimeConfirm = ref(false);
const pendingTime = ref<StoryTime | null>(null);
const pendingScheduledMoves = ref<{ id: string; character_name?: string; to_scene_name?: string; to_scene_id?: string; execute_at_story: StoryTime }[]>([]);
const loadingMoves = ref(false);
const customDayDelta = ref(0);
const customHourDelta = ref(0);
const customMinDelta = ref(30);

function storyTimeToMinutes(t: StoryTime): number {
  return (t.day - 1) * 1440 + t.hour * 60 + t.minute;
}

function calcNewTime(dayDelta: number, hourDelta: number, minDelta: number): StoryTime {
  const base = props.globalStoryTime;
  let total = base.minute + minDelta + (base.hour + hourDelta) * 60 + (base.day - 1 + dayDelta) * 1440;
  total = Math.max(0, total);
  return { day: Math.floor(total / 1440) + 1, hour: Math.floor((total % 1440) / 60), minute: total % 60 };
}

async function askAdvanceTime(dayDelta: number, hourDelta: number, minDelta: number) {
  pendingTime.value = calcNewTime(dayDelta, hourDelta, minDelta);
  pendingScheduledMoves.value = [];
  showTimeConfirm.value = true;
  loadingMoves.value = true;
  try {
    const moves = await api.get<any[]>(`/campaigns/${props.campaignId}/moves?status=pending`);
    const cap = storyTimeToMinutes(pendingTime.value!);
    pendingScheduledMoves.value = moves.filter((m) =>
      m.execute_at_story && storyTimeToMinutes(m.execute_at_story as StoryTime) <= cap
    );
  } catch { /* API 可能未实现，忽略 */ }
  finally { loadingMoves.value = false; }
}

function confirmAdvanceTime() {
  if (!pendingTime.value) return;
  socketClient.gmAdvanceTime({ custom_time: pendingTime.value });
  showTimeConfirm.value = false;
  pendingTime.value = null;
}
</script>

<template>
  <div class="tab-pane">
    <div class="time-display"><span class="time-big">{{ formatTime(globalStoryTime) }}</span></div>
    <div class="quick-btns">
      <button class="q-btn" @click="askAdvanceTime(0,0,10)">+10分</button>
      <button class="q-btn" @click="askAdvanceTime(0,0,30)">+30分</button>
      <button class="q-btn" @click="askAdvanceTime(0,1,0)">+1时</button>
      <button class="q-btn" @click="askAdvanceTime(0,6,0)">+6时</button>
      <button class="q-btn" @click="askAdvanceTime(1,0,0)">+1天</button>
      <button class="q-btn accent" @click="askAdvanceTime(customDayDelta, customHourDelta, customMinDelta)">自定义推进</button>
    </div>
    <div class="custom-row">
      <div class="delta-field"><input v-model.number="customDayDelta" type="number" min="0" /><label>天</label></div>
      <div class="delta-field"><input v-model.number="customHourDelta" type="number" min="0" max="23" /><label>时</label></div>
      <div class="delta-field"><input v-model.number="customMinDelta" type="number" min="0" max="59" /><label>分</label></div>
    </div>
  </div>

  <ElDialog v-model="showTimeConfirm" title="确认推进时间" width="420px">
    <div class="time-confirm-body">
      <p>将推进至 <strong>{{ pendingTime ? formatTime(pendingTime) : '' }}</strong></p>
      <div v-if="loadingMoves" class="moves-hint">加载预约移动中...</div>
      <template v-else>
        <div v-if="pendingScheduledMoves.length > 0" class="moves-list">
          <div class="moves-title">将触发以下预约移动：</div>
          <div v-for="m in pendingScheduledMoves" :key="m.id" class="move-item">
            <span>{{ m.character_name ?? '角色' }}</span>
            <span class="move-arrow">→</span>
            <span>{{ m.to_scene_name ?? '场景' }}</span>
            <span class="move-time">({{ formatTime(m.execute_at_story) }})</span>
          </div>
        </div>
        <div v-else class="moves-hint">无预约移动将在此时触发</div>
      </template>
    </div>
    <template #footer>
      <button class="dlg-btn" @click="showTimeConfirm = false">取消</button>
      <button class="dlg-btn accent" @click="confirmAdvanceTime">确认推进</button>
    </template>
  </ElDialog>
</template>
