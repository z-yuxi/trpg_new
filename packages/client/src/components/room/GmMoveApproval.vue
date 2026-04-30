<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElDialog, ElMessage } from 'element-plus';
import { approveMove as apiApproveMove, rejectMove, forceMove, listUpcomingMoves } from '../../api/campaigns';
import type { Scene } from '@trpg/shared';

const props = defineProps<{
  campaignId: string;
  scenes: Scene[];
  characters: { id: string; name: string }[];
}>();

const spatialScenes = computed(() => props.scenes.filter((s) => s.type === 'spatial' || s.type === 'lobby'));

type ScheduledMove = {
  id: string;
  character_name?: string;
  to_scene_name?: string;
  to_scene_id?: string;
  execute_at_story?: { day?: number; hour: number; minute: number } | null;
};

const currentScheduledMoves = ref<ScheduledMove[]>([]);
const arrivalTimes = ref<Record<string, string>>({});
const loadingMoves = ref(false);
const showRejectDialog = ref(false);
const rejectMoveId = ref('');
const rejectReason = ref('');
const forceMoveCharId = ref('');
const forceMoveSceneId = ref('');

async function loadPendingScheduledMoves() {
  loadingMoves.value = true;
  try {
    currentScheduledMoves.value = await listUpcomingMoves(props.campaignId) as ScheduledMove[];
  } catch {
    // ignore
  } finally {
    loadingMoves.value = false;
  }
}

async function approveMove(moveId: string) {
  try {
    const storyArrivalTime = arrivalTimes.value[moveId]?.trim();
    await apiApproveMove(props.campaignId, moveId, { story_time_arrival: storyArrivalTime ? (() => { const [h, m] = storyArrivalTime.split(':').map(Number); return { hour: h, minute: m }; })() : null });
    currentScheduledMoves.value = currentScheduledMoves.value.filter((m) => m.id !== moveId);
    delete arrivalTimes.value[moveId];
    ElMessage.success('移动已批准');
  } catch (e: any) { ElMessage.error(e.message ?? '批准失败'); }
}

async function approveAllMoves() {
  for (const move of currentScheduledMoves.value) {
    await approveMove(move.id);
  }
}

function openRejectMove(moveId: string) {
  rejectMoveId.value = moveId;
  rejectReason.value = '';
  showRejectDialog.value = true;
}

async function submitRejectMove() {
  if (!rejectMoveId.value) return;
  try {
    await rejectMove(props.campaignId, rejectMoveId.value, rejectReason.value);
    currentScheduledMoves.value = currentScheduledMoves.value.filter((m) => m.id !== rejectMoveId.value);
    showRejectDialog.value = false;
    ElMessage.success('已拒绝该移动申请');
  } catch (e: any) { ElMessage.error(e.message ?? '拒绝失败'); }
}

async function submitForceMoveScene() {
  if (!forceMoveCharId.value || !forceMoveSceneId.value) return;
  try {
    await forceMove(props.campaignId, {
      character_id: forceMoveCharId.value,
      to_scene_id: forceMoveSceneId.value,
    });
    ElMessage.success('强制移动成功');
    forceMoveCharId.value = '';
    forceMoveSceneId.value = '';
  } catch (e: any) { ElMessage.error(e.message ?? '移动失败'); }
}

onMounted(() => {
  loadPendingScheduledMoves();
});
</script>

<template>
  <div class="tab-pane">
    <div class="pane-header">
      <span class="pane-count">待审批移动（{{ currentScheduledMoves.length }}）</span>
      <div class="pane-actions">
        <button class="sm-btn" @click="loadPendingScheduledMoves" :disabled="loadingMoves">刷新</button>
        <button class="sm-btn accent" :disabled="currentScheduledMoves.length === 0" @click="approveAllMoves">全部批准</button>
      </div>
    </div>
    <div v-if="loadingMoves" class="moves-hint">加载中...</div>
    <div v-else-if="currentScheduledMoves.length === 0" class="empty-hint">暂无待审批移动</div>
    <div v-else v-for="move in currentScheduledMoves" :key="move.id" class="move-preview-row">
      <div class="move-info">
        <div class="move-char">{{ move.character_name || '未命名角色' }}</div>
        <div class="move-scene">→ {{ move.to_scene_name || move.to_scene_id }}</div>
        <input v-model="arrivalTimes[move.id]" class="field-input arrival-input" placeholder="可选：HH:MM" />
      </div>
      <div class="move-btns">
        <button class="sm-btn accent" @click="approveMove(move.id)">批准</button>
        <button class="sm-btn danger" @click="openRejectMove(move.id)">拒绝</button>
      </div>
    </div>
    <div class="pane-header" style="margin-top:12px">
      <span class="pane-count">强制移动角色</span>
    </div>
    <div class="force-move-row">
      <select v-model="forceMoveCharId" class="field-input">
        <option value="">选择角色</option>
        <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <select v-model="forceMoveSceneId" class="field-input">
        <option value="">目标场景</option>
        <option v-for="s in spatialScenes" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <button class="sm-btn accent" :disabled="!forceMoveCharId || !forceMoveSceneId" @click="submitForceMoveScene">执行</button>
    </div>
  </div>

  <ElDialog v-model="showRejectDialog" title="拒绝移动申请" width="360px">
    <div class="form-body">
      <label class="form-label">拒绝原因（选填）</label>
      <textarea v-model="rejectReason" class="field-input" rows="2" placeholder="请输入拒绝理由..." />
    </div>
    <template #footer>
      <button class="dlg-btn" @click="showRejectDialog = false">取消</button>
      <button class="dlg-btn danger" @click="submitRejectMove">确认拒绝</button>
    </template>
  </ElDialog>
</template>
