<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { socketClient } from '../../socket/socket-client';
import type { StoryTime } from '@trpg/shared';

const props = defineProps<{
  campaignId: string;
  globalStoryTime: StoryTime;
}>();

function padZ(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function formatTime(t: StoryTime) { return `第${t.day}日 ${padZ(t.hour)}:${padZ(t.minute)}`; }

const hour = ref(String(props.globalStoryTime.hour).padStart(2, '0'));
const minute = ref(String(props.globalStoryTime.minute).padStart(2, '0'));
const timeLabel = computed(() => `${hour.value}:${minute.value}`);

function announceTime() {
  if (!/^\d{2}$/.test(hour.value) || !/^\d{2}$/.test(minute.value)) {
    ElMessage.error('请输入 HH:MM 格式时间');
    return;
  }
  socketClient.gmAnnounceTime(timeLabel.value);
  ElMessage.success(`已宣布时间 ${timeLabel.value}`);
}
</script>

<template>
  <div class="tab-pane">
    <div class="time-display"><span class="time-big">{{ formatTime(globalStoryTime) }}</span></div>
    <div class="custom-row">
      <div class="delta-field"><input v-model="hour" type="text" maxlength="2" /><label>时</label></div>
      <div class="delta-field"><input v-model="minute" type="text" maxlength="2" /><label>分</label></div>
    </div>
    <div class="quick-btns">
      <button class="q-btn accent" @click="announceTime">插入时间标签</button>
    </div>
  </div>
</template>
