<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../utils/api';
import type { StoryTime } from '@trpg/shared';

const props = defineProps<{
  campaignId: string;
  globalStoryTime?: StoryTime;
  characters?: { id: string; name: string; sceneId?: string }[];
}>();

const emit = defineEmits<{
  (e: 'pending-count', n: number): void;
}>();

// ── Types ───────────────────────────────────────────────────────────────────
type ScheduledMove = {
  id: string;
  character_name?: string;
  to_scene_name?: string;
  to_scene_id?: string;
  execute_at_story: { day: number; hour: number; minute: number };
};

// ── State ────────────────────────────────────────────────────────────────────
const pendingMoves = ref<ScheduledMove[]>([]);
const loadingMoves = ref(false);
const rejectingId = ref('');
const rejectReason = ref('');
const showRejectInput = ref<string | null>(null); // id of move being rejected

// ── Helpers ──────────────────────────────────────────────────────────────────
function padZ(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function formatStoryTime(t: { day: number; hour: number; minute: number }) {
  return `第${t.day}日 ${padZ(t.hour)}:${padZ(t.minute)}`;
}

// ── API calls ────────────────────────────────────────────────────────────────
async function loadPendingMoves() {
  loadingMoves.value = true;
  try {
    pendingMoves.value = await api.get<ScheduledMove[]>(`/campaigns/${props.campaignId}/moves?status=pending`);
    emit('pending-count', pendingMoves.value.length);
  } catch {
    // ignore
  } finally {
    loadingMoves.value = false;
  }
}

async function approveMove(moveId: string) {
  try {
    await api.post(`/campaigns/${props.campaignId}/moves/${moveId}/approve`);
    pendingMoves.value = pendingMoves.value.filter((m) => m.id !== moveId);
    emit('pending-count', pendingMoves.value.length);
    ElMessage.success('移动已批准');
  } catch (e: any) { ElMessage.error(e?.message ?? '批准失败'); }
}

async function approveAll() {
  const ids = pendingMoves.value.map((m) => m.id);
  for (const id of ids) {
    await approveMove(id);
  }
}

function startReject(moveId: string) {
  showRejectInput.value = moveId;
  rejectReason.value = '';
}

async function confirmReject(moveId: string) {
  try {
    await api.post(`/campaigns/${props.campaignId}/moves/${moveId}/reject`, { reason: rejectReason.value });
    pendingMoves.value = pendingMoves.value.filter((m) => m.id !== moveId);
    showRejectInput.value = null;
    emit('pending-count', pendingMoves.value.length);
    ElMessage.success('已拒绝该移动申请');
  } catch (e: any) { ElMessage.error(e?.message ?? '拒绝失败'); }
}

function cancelReject() {
  showRejectInput.value = null;
  rejectReason.value = '';
}

onMounted(() => {
  loadPendingMoves();
});

watch(() => props.campaignId, () => {
  loadPendingMoves();
});
</script>

<template>
  <div class="now-panel">
    <!-- 故事时钟 -->
    <section class="story-clock-section" v-if="globalStoryTime">
      <div class="story-clock">
        <span class="clock-label">故事时间</span>
        <span class="clock-value">{{ formatStoryTime(globalStoryTime) }}</span>
      </div>
    </section>

    <!-- 待处理移动申请 -->
    <section class="panel-section">
      <div class="section-header">
        <h3 class="section-title">待审批移动</h3>
        <span class="section-count" v-if="pendingMoves.length">{{ pendingMoves.length }}</span>
        <button v-if="pendingMoves.length > 1" class="action-link" @click="approveAll">全部批准</button>
        <button class="refresh-btn" @click="loadPendingMoves" :disabled="loadingMoves" title="刷新">
          ↺
        </button>
      </div>

      <div v-if="loadingMoves" class="section-loading">加载中...</div>
      <div v-else-if="!pendingMoves.length" class="section-empty">无待处理的移动申请</div>
      <ul v-else class="move-list">
        <li v-for="move in pendingMoves" :key="move.id" class="move-card">
          <div class="move-info">
            <span class="move-char">{{ move.character_name ?? '未知角色' }}</span>
            <span class="move-arrow">→</span>
            <span class="move-scene">{{ move.to_scene_name ?? '未知场景' }}</span>
            <span class="move-time">{{ formatStoryTime(move.execute_at_story) }}</span>
          </div>

          <div v-if="showRejectInput === move.id" class="reject-form">
            <input
              v-model="rejectReason"
              class="reject-input"
              placeholder="拒绝理由（可选）"
              @keydown.enter="confirmReject(move.id)"
              @keydown.escape="cancelReject"
            />
            <button class="btn-danger-sm" @click="confirmReject(move.id)">确认拒绝</button>
            <button class="btn-ghost-sm" @click="cancelReject">取消</button>
          </div>
          <div v-else class="move-actions">
            <button class="btn-approve" @click="approveMove(move.id)">批准</button>
            <button class="btn-reject" @click="startReject(move.id)">拒绝</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- 在线玩家 -->
    <section class="panel-section" v-if="characters?.length">
      <div class="section-header">
        <h3 class="section-title">角色列表</h3>
      </div>
      <ul class="player-list">
        <li v-for="char in characters" :key="char.id" class="player-row">
          <span class="player-avatar">{{ char.name.charAt(0) }}</span>
          <span class="player-name">{{ char.name }}</span>
          <span v-if="char.sceneId" class="player-scene-hint">在某场景</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.now-panel {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6, 24px);
  display: flex;
  flex-direction: column;
  gap: var(--space-6, 24px);
}

/* 故事时钟 */
.story-clock-section {
  display: flex;
}
.story-clock {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px) var(--space-6, 24px);
}
.clock-label {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
.clock-value {
  font-size: var(--text-xl, 20px);
  font-weight: 700;
  font-family: var(--font-mono);
  color: var(--color-accent, #3b82f6);
}

/* Section */
.panel-section {
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px) var(--space-5, 20px);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}
.section-title {
  font-size: var(--text-base);
  font-weight: 600;
  margin: 0;
}
.section-count {
  background: var(--color-error, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}
.action-link {
  margin-left: auto;
  border: none;
  background: none;
  color: var(--color-accent, #3b82f6);
  cursor: pointer;
  font-size: var(--text-sm);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.action-link:hover { background: var(--color-page-bg); }
.refresh-btn {
  margin-left: 4px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
.refresh-btn:hover { color: var(--color-text-primary); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.section-loading, .section-empty {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-4) 0;
}

/* Move list */
.move-list {
  list-style: none;
  margin: 0; padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
.move-card {
  background: var(--color-page-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
.move-info {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.move-char { font-weight: 600; color: var(--color-text-primary); }
.move-arrow { color: var(--color-text-muted); }
.move-scene { color: var(--color-accent, #3b82f6); }
.move-time { margin-left: auto; font-size: var(--text-xs); font-family: var(--font-mono); color: var(--color-text-muted); }
.move-actions {
  display: flex;
  gap: var(--space-2, 8px);
  justify-content: flex-end;
}
.reject-form {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
}
.reject-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-sm);
  background: var(--color-card-bg);
  font-size: var(--text-sm);
  color: var(--color-text-primary);
}

.btn-approve, .btn-reject, .btn-danger-sm, .btn-ghost-sm {
  padding: 4px 14px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 500;
  transition: filter var(--transition-fast);
}
.btn-approve { background: var(--color-success, #22c55e); color: #fff; }
.btn-approve:hover { filter: brightness(1.1); }
.btn-reject { background: var(--color-page-bg); color: var(--color-text-secondary); border: 1px solid var(--color-card-border); }
.btn-reject:hover { color: var(--color-error, #ef4444); border-color: var(--color-error, #ef4444); }
.btn-danger-sm { background: var(--color-error, #ef4444); color: #fff; }
.btn-danger-sm:hover { filter: brightness(1.1); }
.btn-ghost-sm { background: none; color: var(--color-text-secondary); border: 1px solid var(--color-card-border); }
.btn-ghost-sm:hover { background: var(--color-page-bg); }

/* Player list */
.player-list {
  list-style: none; margin: 0; padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
.player-row {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-2, 8px) 0;
  border-bottom: 1px solid var(--color-card-border);
}
.player-row:last-child { border-bottom: none; }
.player-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--color-accent, #3b82f6);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--text-sm);
  flex-shrink: 0;
}
.player-name { font-weight: 500; }
.player-scene-hint { margin-left: auto; font-size: var(--text-xs); color: var(--color-text-muted); }
</style>
