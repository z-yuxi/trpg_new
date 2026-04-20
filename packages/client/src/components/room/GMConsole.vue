<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElDialog, ElMessage, ElMessageBox } from 'element-plus';
import SvgIcon from '../SvgIcon.vue';
import ClueCard from '../ClueCard.vue';
import GridMap from './GridMap.vue';
import TrajectoryMatrix from './TrajectoryMatrix.vue';
import SceneRoadmap from './SceneRoadmap.vue';
import GmClueLibrary from './GmClueLibrary.vue';
import type { StoryTime, Scene, CampaignNpc } from '@trpg/shared';
import { socketClient } from '../../socket/socket-client';
import { useAuthStore } from '../../stores/auth-store';
import { extractBlocks } from '../../utils/block-integrity-validator';

const props = defineProps<{
  campaignId: string;
  globalStoryTime: StoryTime;
  scenes: Scene[];
  npcs: CampaignNpc[];
  characters: { id: string; name: string; sceneId?: string }[];
  /** 独立页面模式：不显示折叠面板外层，占满父容器高度 */
  standalone?: boolean;
  /** 默认打开的 Tab（用于从路由跳转时预选） */
  defaultTab?: 'time' | 'moves' | 'scenes' | 'npcs' | 'clue' | 'broadcast' | 'grid' | 'trajectory';
}>();

const emit = defineEmits<{
  'scene-created': [scene: Scene];
  'npc-created': [npc: CampaignNpc];
  'play-as-npc': [npcId: string];
}>();

const authStore = useAuthStore();

const activeTab = ref<'time' | 'moves' | 'scenes' | 'npcs' | 'clue' | 'broadcast' | 'grid' | 'trajectory'>(props.defaultTab ?? 'time');
const activeGridSceneId = ref('');

function padZ(n: number) { return String(n).padStart(2, '0'); }
function formatTime(t: StoryTime) { return `第${t.day}日 ${padZ(t.hour)}:${padZ(t.minute)}`; }

// ─── Tab 1: 时间控制 ─────────────────────────────────────────────────────────
const showTimeConfirm = ref(false);
const pendingTime = ref<StoryTime | null>(null);
const pendingScheduledMoves = ref<{ id: string; character_name?: string; to_scene_name?: string; to_scene_id?: string; execute_at_story: StoryTime }[]>([]);
const currentScheduledMoves = ref<{ id: string; character_name?: string; to_scene_name?: string; to_scene_id?: string; execute_at_story: StoryTime }[]>([]);
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
    const res = await fetch(`/api/campaigns/${props.campaignId}/moves?status=pending`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      const moves: any[] = await res.json();
      const cap = storyTimeToMinutes(pendingTime.value!);
      pendingScheduledMoves.value = moves.filter((m) =>
        m.execute_at_story && storyTimeToMinutes(m.execute_at_story as StoryTime) <= cap
      );
    }
  } catch { /* API 可能未实现，忽略 */ }
  finally { loadingMoves.value = false; }
}

async function loadPendingScheduledMoves() {
  loadingMoves.value = true;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/moves?status=pending`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) return;
    currentScheduledMoves.value = await res.json();
  } catch {
    // ignore
  } finally {
    loadingMoves.value = false;
  }
}

async function approveMove(moveId: string) {
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/moves/${moveId}/approve`, {
      method: 'POST', headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '批准失败');
    currentScheduledMoves.value = currentScheduledMoves.value.filter((m) => m.id !== moveId);
    ElMessage.success('移动已批准');
  } catch (e: any) { ElMessage.error(e.message ?? '批准失败'); }
}

async function approveAllMoves() {
  for (const move of currentScheduledMoves.value) {
    await approveMove(move.id);
  }
}

// 拒绝移动
const showRejectDialog = ref(false);
const rejectMoveId = ref('');
const rejectReason = ref('');

function openRejectMove(moveId: string) {
  rejectMoveId.value = moveId;
  rejectReason.value = '';
  showRejectDialog.value = true;
}

async function submitRejectMove() {
  if (!rejectMoveId.value) return;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/moves/${rejectMoveId.value}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({ reason: rejectReason.value }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '拒绝失败');
    currentScheduledMoves.value = currentScheduledMoves.value.filter((m) => m.id !== rejectMoveId.value);
    showRejectDialog.value = false;
    ElMessage.success('已拒绝该移动申请');
  } catch (e: any) { ElMessage.error(e.message ?? '拒绝失败'); }
}

function confirmAdvanceTime() {
  if (!pendingTime.value) return;
  socketClient.gmAdvanceTime({ custom_time: pendingTime.value });
  showTimeConfirm.value = false;
  pendingTime.value = null;
}

// ─── Tab 2: 场景管理 ─────────────────────────────────────────────────────────
const showNewScene = ref(false);
const newScene = ref({ name: '', type: 'spatial' as 'spatial' | 'virtual' | 'lobby', description: '' });
const sceneLoading = ref(false);
const typeLabel: Record<string, string> = { spatial: '剧情场', virtual: '私密场', lobby: '公共场' };

async function createScene() {
  if (!newScene.value.name.trim()) { ElMessage.warning('场景名称不能为空'); return; }
  sceneLoading.value = true;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify(newScene.value),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '创建失败');
    const scene = await res.json();
    emit('scene-created', scene);
    showNewScene.value = false;
    newScene.value = { name: '', type: 'spatial', description: '' };
    ElMessage.success('场景已创建');
  } catch (e: any) { ElMessage.error(e.message ?? '创建失败'); }
  finally { sceneLoading.value = false; }
}

const showForceMoveScene = ref(false);
const forceMoveCharId = ref('');
const forceMoveSceneId = ref('');

async function submitForceMoveScene() {
  if (!forceMoveCharId.value || !forceMoveSceneId.value) return;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/moves/force`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({ character_id: forceMoveCharId.value, to_scene_id: forceMoveSceneId.value }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '移动失败');
    ElMessage.success('强制移动成功');
    showForceMoveScene.value = false;
  } catch (e: any) { ElMessage.error(e.message ?? '移动失败'); }
}

// 编辑场景
const showEditScene = ref(false);
const editingSceneId = ref('');
const editSceneForm = ref({ name: '', type: 'spatial' as 'spatial' | 'virtual' | 'lobby', description: '', history_visibility: 'all' as 'none' | 'recent' | 'all' });
const sceneEditLoading = ref(false);

function openEditScene(scene: any) {
  editingSceneId.value = scene.id;
  editSceneForm.value = { name: scene.name, type: scene.type, description: scene.description ?? '', history_visibility: scene.history_visibility ?? 'all' };
  showEditScene.value = true;
}

async function saveSceneEdit() {
  if (!editSceneForm.value.name.trim()) { ElMessage.warning('场景名不能为空'); return; }
  sceneEditLoading.value = true;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/scenes/${editingSceneId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify(editSceneForm.value),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '更新失败');
    showEditScene.value = false;
    ElMessage.success('场景已更新，刷新页面生效');
  } catch (e: any) { ElMessage.error(e.message ?? '更新失败'); }
  finally { sceneEditLoading.value = false; }
}

// 删除场景
const showDeleteSceneConfirm = ref(false);
const deletingSceneId = ref('');
const deletingSceneName = ref('');

function openDeleteScene(scene: any) {
  deletingSceneId.value = scene.id;
  deletingSceneName.value = scene.name;
  showDeleteSceneConfirm.value = true;
}

async function confirmDeleteScene() {
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/scenes/${deletingSceneId.value}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '删除失败');
    showDeleteSceneConfirm.value = false;
    ElMessage.success('场景已删除，刷新页面生效');
  } catch (e: any) { ElMessage.error(e.message ?? '删除失败'); }
}

// ─── Tab 3: NPC 控制 ─────────────────────────────────────────────────────────
const showNewNpc = ref(false);
const showNpcAdvanced = ref(false);
const newNpc = ref({ name: '', display_name: '', description: '', roleplay_hint: '', avatar_url: '', attributes: [] as {key:string;value:string}[], skills: [] as {key:string;value:string}[] });
const npcLoading = ref(false);

function addAttr() { newNpc.value.attributes.push({ key: '', value: '' }); }
function addSkill() { newNpc.value.skills.push({ key: '', value: '' }); }
function removeAttr(i: number) { newNpc.value.attributes.splice(i, 1); }
function removeSkill(i: number) { newNpc.value.skills.splice(i, 1); }

async function createNpc() {
  if (!newNpc.value.name.trim()) { ElMessage.warning('NPC 名称不能为空'); return; }
  npcLoading.value = true;
  try {
    const body: Record<string, unknown> = { name: newNpc.value.name, display_name: newNpc.value.display_name || newNpc.value.name, description: newNpc.value.description, roleplay_hint: newNpc.value.roleplay_hint, avatar_url: newNpc.value.avatar_url };
    if (newNpc.value.attributes.length > 0) body.attributes = Object.fromEntries(newNpc.value.attributes.map(a => [a.key, Number(a.value) || 0]));
    if (newNpc.value.skills.length > 0) body.skills = Object.fromEntries(newNpc.value.skills.map(s => [s.key, Number(s.value) || 0]));
    const res = await fetch(`/api/campaigns/${props.campaignId}/npcs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '创建失败');
    const npc = await res.json();
    emit('npc-created', npc);
    showNewNpc.value = false;
    newNpc.value = { name: '', display_name: '', description: '', roleplay_hint: '', avatar_url: '', attributes: [], skills: [] };
    showNpcAdvanced.value = false;
    ElMessage.success('NPC 已创建');
  } catch (e: any) { ElMessage.error(e.message ?? '创建失败'); }
  finally { npcLoading.value = false; }
}

// ─── Tab 4: 广播与线索 ────────────────────────────────────────────────────────
const broadcastContent = ref('');
function sendBroadcast() {
  const text = broadcastContent.value.trim();
  if (!text) return;
  socketClient.sendMessage({ content: `[GM公告] ${text}`, message_type: 'announcement' });
  broadcastContent.value = '';
  ElMessage.success('公告已发送');
}

const THEMES = ['river','blur','fragment','wave','ancient','blood','ash','cyber'] as const;
type ClueTheme = typeof THEMES[number];
type CampaignClueRecord = {
  id: string;
  title: string;
  content: string;
  theme: ClueTheme;
  created_at?: string;
  revealed_to?: string[] | null;
  is_revealed?: boolean;
};
type ModulePresetClue = {
  id: string;
  title: string;
  content: string;
  theme: ClueTheme;
  revealMethod: string;
};
const clueForm = ref({ title: '', content: '', theme: 'river' as ClueTheme });
const showClueTargetDialog = ref(false);
const clueTargetAll = ref(true);
const clueTargetCharId = ref('');
const clueDialogMode = ref<'create' | 'reveal'>('create');
const localClues = ref<CampaignClueRecord[]>([]);
const showEditClueDialog = ref(false);
const editingClueId = ref('');
const editClueForm = ref({ title: '', content: '', theme: 'river' as ClueTheme });
const pendingRevealClueId = ref('');
const pendingRevealCluePreview = ref<CampaignClueRecord | null>(null);
const modulePresetClues = ref<ModulePresetClue[]>([]);
const modulePresetLoading = ref(false);

function normalizeClueTheme(value: unknown): ClueTheme {
  return THEMES.includes(value as ClueTheme) ? (value as ClueTheme) : 'river';
}

function resetClueTargetDialog() {
  showClueTargetDialog.value = false;
  clueTargetAll.value = true;
  clueTargetCharId.value = '';
  clueDialogMode.value = 'create';
  pendingRevealClueId.value = '';
  pendingRevealCluePreview.value = null;
}

function clueAudienceLabel(clue: CampaignClueRecord): string {
  if (clue.revealed_to == null) return '全员可见';
  if (clue.revealed_to.length === 0) return '尚未指定角色';
  return `已向 ${clue.revealed_to.length} 名角色开放`;
}

function applyLocalClueUpdate(updated: CampaignClueRecord) {
  const next = localClues.value.map((clue) => (clue.id === updated.id ? updated : clue));
  localClues.value = next;
}

function usePresetClue(clue: ModulePresetClue) {
  clueForm.value = {
    title: clue.title,
    content: clue.content,
    theme: clue.theme,
  };
  ElMessage.success('已载入模组线索');
}

async function loadModulePresetClues() {
  modulePresetLoading.value = true;
  try {
    const campaignRes = await fetch(`/api/campaigns/${props.campaignId}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!campaignRes.ok) {
      modulePresetClues.value = [];
      return;
    }

    const campaign = await campaignRes.json() as { module_id?: string | null };
    if (!campaign.module_id) {
      modulePresetClues.value = [];
      return;
    }

    const moduleRes = await fetch(`/api/modules/${campaign.module_id}`);
    if (!moduleRes.ok) {
      modulePresetClues.value = [];
      return;
    }

    const moduleData = await moduleRes.json() as { content?: string | null };
    const blocks = extractBlocks(moduleData.content ?? '');
    modulePresetClues.value = blocks
      .filter((block) => block.type === 'clue')
      .map((block) => ({
        id: block.id,
        title: String(block.attrs['clue_name'] ?? '').trim(),
        content: String(block.attrs['content'] ?? '').trim(),
        theme: normalizeClueTheme(block.attrs['theme']),
        revealMethod: String(block.attrs['reveal_method'] ?? 'gm_manual'),
      }))
      .filter((block) => block.title || block.content);
  } catch {
    modulePresetClues.value = [];
  } finally {
    modulePresetLoading.value = false;
  }
}

async function loadClues() {
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/clues`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) return;
    const clues = await res.json() as CampaignClueRecord[];
    localClues.value = clues;
  } catch {
    // ignore initial load failure
  }
}

function prepareClue() {
  if (!clueForm.value.title.trim() || !clueForm.value.content.trim()) { ElMessage.warning('标题和内容不能为空'); return; }
  clueDialogMode.value = 'create';
  showClueTargetDialog.value = true;
}

function prepareRevealClue(clue: CampaignClueRecord) {
  clueDialogMode.value = 'reveal';
  pendingRevealClueId.value = clue.id;
  pendingRevealCluePreview.value = clue;
  clueTargetAll.value = clue.revealed_to == null;
  clueTargetCharId.value = '';
  showClueTargetDialog.value = true;
}

async function sendClue() {
  if (!clueTargetAll.value && !clueTargetCharId.value) {
    ElMessage.warning('请选择要发放的角色');
    return;
  }

  try {
    const visibleTo = clueTargetAll.value ? null : [clueTargetCharId.value];

    if (clueDialogMode.value === 'reveal' && pendingRevealClueId.value && pendingRevealCluePreview.value) {
      const endpoint = `/api/campaigns/${props.campaignId}/clues/${pendingRevealClueId.value}`;
      const res = await fetch(clueTargetAll.value ? endpoint : `${endpoint}/reveal`, {
        method: clueTargetAll.value ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
        body: JSON.stringify(clueTargetAll.value
          ? { is_revealed: true, revealed_to: null }
          : { character_ids: visibleTo }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '发放失败');

      const clue = await res.json() as CampaignClueRecord;
      applyLocalClueUpdate(clue);
      socketClient.sendMessage({
        content: clue.id,
        message_type: 'clue_card',
        visible_to: visibleTo ?? undefined,
        metadata: { clue_id: clue.id, theme: clue.theme, title: clue.title, content: clue.content },
      });
      resetClueTargetDialog();
      ElMessage.success('线索已再次发放');
      return;
    }

    const res = await fetch(`/api/campaigns/${props.campaignId}/clues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({
        title: clueForm.value.title,
        content: clueForm.value.content,
        theme: clueForm.value.theme,
        is_revealed: true,
        revealed_to: visibleTo,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '发放失败');
    const clue = await res.json() as { id: string; title: string; content: string; theme: ClueTheme };
    localClues.value.unshift(clue);
    socketClient.sendMessage({
      content: clue.id,
      message_type: 'clue_card',
      visible_to: visibleTo ?? undefined,
      metadata: { clue_id: clue.id, theme: clue.theme, title: clue.title, content: clue.content },
    });
    clueForm.value = { title: '', content: '', theme: 'river' };
    resetClueTargetDialog();
    ElMessage.success('线索已发放');
  } catch (e: any) {
    ElMessage.error(e?.message ?? '发放失败');
  }
}

function openEditClue(clue: { id: string; title: string; content: string; theme: ClueTheme }) {
  editingClueId.value = clue.id;
  editClueForm.value = {
    title: clue.title,
    content: clue.content,
    theme: clue.theme,
  };
  showEditClueDialog.value = true;
}

async function saveClueEdit() {
  if (!editingClueId.value) return;
  if (!editClueForm.value.title.trim() || !editClueForm.value.content.trim()) {
    ElMessage.warning('标题和内容不能为空');
    return;
  }

  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/clues/${editingClueId.value}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({
        title: editClueForm.value.title,
        content: editClueForm.value.content,
        theme: editClueForm.value.theme,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '更新失败');

    const updated = await res.json() as CampaignClueRecord;
    applyLocalClueUpdate(updated);
    showEditClueDialog.value = false;
    editingClueId.value = '';
    ElMessage.success('线索已更新');
  } catch (e: any) {
    ElMessage.error(e?.message ?? '更新失败');
  }
}

async function deleteClue(clue: CampaignClueRecord) {
  try {
    await ElMessageBox.confirm(`确认删除线索“${clue.title}”吗？`, '删除线索', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    });
  } catch {
    return;
  }

  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/clues/${clue.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) throw new Error((await res.json()).error ?? '删除失败');
    localClues.value = localClues.value.filter((item) => item.id !== clue.id);
    ElMessage.success('线索已删除');
  } catch (e: any) {
    ElMessage.error(e?.message ?? '删除失败');
  }
}

const spatialScenes = computed(() => props.scenes.filter(s => s.type === 'spatial' || s.type === 'lobby'));

const gridCharacters = computed(() => props.characters.map((character) => ({
  id: character.id,
  name: character.name,
  sceneId: character.sceneId,
})));

const activeGridScene = computed(() => {
  const current = spatialScenes.value.find((scene) => scene.id === activeGridSceneId.value);
  return current ?? spatialScenes.value[0] ?? null;
});

// ─── Tab 5: 轨迹矩阵 ─────────────────────────────────────────────────────────
type TrajectoryMatrixResponse = {
  time_axis: Array<{ day: number; hour: number }>;
  characters: Array<{ id: string; name: string }>;
  matrix: Record<string, Array<{
    scene_id: string;
    scene_name: string;
    from_time: StoryTime;
    to_time: StoryTime | null;
    move_type: string;
  }>>;
};

const trajectoryData = ref<TrajectoryMatrixResponse>({
  time_axis: [],
  characters: [],
  matrix: {},
});
const trajectoryLoading = ref(false);

async function loadTrajectoryHistory() {
  trajectoryLoading.value = true;
  try {
    const res = await fetch(`/api/campaigns/${props.campaignId}/trajectory-matrix`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      trajectoryData.value = await res.json();
    }
  } catch { /* ignore */ }
  finally { trajectoryLoading.value = false; }
}

onMounted(() => {
  loadClues();
  loadModulePresetClues();
  loadPendingScheduledMoves();
  if (!activeGridSceneId.value && spatialScenes.value[0]?.id) {
    activeGridSceneId.value = spatialScenes.value[0].id;
  }
});
</script>

<template>
  <div class="gm-console" :class="{ 'gm-console--standalone': standalone }">
    <div class="console-tabs">
      <button v-for="tab in ([{key:'time',icon:'icon-clock',label:'时间'},{key:'moves',icon:'icon-history',label:'移动'},{key:'scenes',icon:'icon-grid',label:'场景'},{key:'npcs',icon:'icon-npc',label:'NPC'},{key:'clue',icon:'icon-scroll',label:'线索'},{key:'grid',icon:'icon-grid',label:'地图'},{key:'trajectory',icon:'icon-history',label:'轨迹'},{key:'broadcast',icon:'icon-broadcast',label:'广播'}] as const)" :key="tab.key" class="console-tab" :class="{active:activeTab===tab.key}" @click="activeTab=tab.key">
        <SvgIcon :name="tab.icon" :size="14" /><span>{{tab.label}}</span>
      </button>
    </div>
    <div class="console-body">
      <!-- Tab 1: 时间 -->
      <div v-if="activeTab==='time'" class="tab-pane">
        <div class="time-display"><span class="time-big">{{formatTime(globalStoryTime)}}</span></div>
        <div class="quick-btns">
          <button class="q-btn" @click="askAdvanceTime(0,0,10)">+10分</button>
          <button class="q-btn" @click="askAdvanceTime(0,0,30)">+30分</button>
          <button class="q-btn" @click="askAdvanceTime(0,1,0)">+1时</button>
          <button class="q-btn" @click="askAdvanceTime(0,6,0)">+6时</button>
          <button class="q-btn" @click="askAdvanceTime(1,0,0)">+1天</button>
          <button class="q-btn accent" @click="askAdvanceTime(customDayDelta,customHourDelta,customMinDelta)">自定义推进</button>
        </div>
        <div class="custom-row">
          <div class="delta-field"><input v-model.number="customDayDelta" type="number" min="0"/><label>天</label></div>
          <div class="delta-field"><input v-model.number="customHourDelta" type="number" min="0" max="23"/><label>时</label></div>
          <div class="delta-field"><input v-model.number="customMinDelta" type="number" min="0" max="59"/><label>分</label></div>
        </div>
      </div>
      <!-- Tab 2: 移动审批 -->
      <div v-else-if="activeTab==='moves'" class="tab-pane">
        <div class="pane-header">
          <span class="pane-count">待审批移动（{{ currentScheduledMoves.length }}）</span>
          <div class="pane-actions">
            <button class="sm-btn" @click="loadPendingScheduledMoves" :disabled="loadingMoves">刷新</button>
            <button class="sm-btn accent" :disabled="currentScheduledMoves.length===0" @click="approveAllMoves">全部批准</button>
          </div>
        </div>
        <div v-if="loadingMoves" class="moves-hint">加载中...</div>
        <div v-else-if="currentScheduledMoves.length===0" class="empty-hint">暂无待审批移动</div>
        <div v-else v-for="move in currentScheduledMoves" :key="move.id" class="move-preview-row">
          <div class="move-info">
            <div class="move-char">{{ move.character_name || '未命名角色' }}</div>
            <div class="move-scene">→ {{ move.to_scene_name || move.to_scene_id }} · {{ move.execute_at_story ? formatTime(move.execute_at_story) : '—' }}</div>
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
          <select v-model="forceMoveCharId" class="field-input"><option value="">选择角色</option><option v-for="c in characters" :key="c.id" :value="c.id">{{c.name}}</option></select>
          <select v-model="forceMoveSceneId" class="field-input"><option value="">目标场景</option><option v-for="s in spatialScenes" :key="s.id" :value="s.id">{{s.name}}</option></select>
          <button class="sm-btn accent" :disabled="!forceMoveCharId||!forceMoveSceneId" @click="submitForceMoveScene">执行</button>
        </div>
      </div>
      <!-- Tab 3: 场景 -->
      <div v-else-if="activeTab==='scenes'" class="tab-pane">
        <div class="pane-header">
          <span class="pane-count">共{{scenes.length}}个场景</span>
          <div class="pane-actions">
            <button class="sm-btn accent" @click="showNewScene=true">+ 新建场景</button>
          </div>
        </div>
        <table class="data-table"><thead><tr><th>名称</th><th>类型</th><th>历史</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="s in scenes" :key="s.id">
              <td class="td-name">{{s.name}}</td>
              <td><span class="type-tag" :class="s.type">{{typeLabel[s.type]??s.type}}</span></td>
              <td class="td-vis">{{s.history_visibility??'all'}}</td>
              <td class="td-actions">
                <button class="sm-btn" @click="openEditScene(s)">编辑</button>
                <button class="sm-btn danger" @click="openDeleteScene(s)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="scenes.length===0" class="empty-hint">暂无场景</div>
        <SceneRoadmap
          :campaign-id="campaignId"
          :scenes="scenes"
          :characters="characters"
          :is-gm="true"
          style="margin-top:var(--space-3)"
        />
      </div>
      <!-- Tab 3: NPC -->
      <div v-else-if="activeTab==='npcs'" class="tab-pane">
        <div class="pane-header">
          <span class="pane-count">共{{npcs.length}}个NPC</span>
          <button class="sm-btn accent" @click="showNewNpc=true">+ 新建NPC</button>
        </div>
        <div class="npc-cards">
          <div v-for="npc in npcs" :key="npc.id" class="npc-card">
            <div class="npc-avatar"><img v-if="npc.avatar_url" :src="npc.avatar_url"/><span v-else>{{(npc.display_name||npc.name)[0]}}</span></div>
            <div class="npc-info"><div class="npc-name">{{npc.display_name||npc.name}}</div><div class="npc-desc">{{npc.description||'暂无描述'}}</div></div>
            <button class="sm-btn" @click="emit('play-as-npc',npc.id)">扮演</button>
          </div>
        </div>
        <div v-if="npcs.length===0" class="empty-hint">暂无NPC</div>
      </div>
      <div v-else-if="activeTab==='grid'" class="tab-pane grid-pane">
        <div class="pane-header">
          <span class="pane-count">网格地图 V1</span>
          <select v-model="activeGridSceneId" class="field-input grid-scene-select">
            <option v-for="scene in spatialScenes" :key="scene.id" :value="scene.id">{{ scene.name }}</option>
          </select>
        </div>
        <GridMap
          v-if="activeGridScene"
          :campaign-id="campaignId"
          :scene-id="activeGridScene.id"
          :is-g-m="true"
          :characters="gridCharacters"
          :npcs="npcs.map((npc) => ({ id: npc.id, name: npc.name, display_name: npc.display_name }))"
        />
        <div v-else class="empty-hint">请先创建空间场景后再使用地图</div>
      </div>
      <!-- Tab 5: 轨迹矩阵 -->
      <div v-else-if="activeTab==='trajectory'" class="tab-pane">
        <div class="pane-header">
          <span class="pane-count">角色轨迹历史</span>
          <button class="sm-btn" @click="loadTrajectoryHistory" :disabled="trajectoryLoading">
            {{ trajectoryLoading ? '加载中...' : '刷新' }}
          </button>
        </div>
        <div v-if="trajectoryData.time_axis.length === 0 && !trajectoryLoading" class="empty-hint">暂无轨迹数据，点击刷新加载</div>
        <TrajectoryMatrix
          v-else
          :campaign-id="campaignId"
          :time-axis="trajectoryData.time_axis"
          :matrix="trajectoryData.matrix"
          :characters="trajectoryData.characters.length ? trajectoryData.characters : characters"
          :current-time="globalStoryTime"
          :is-gm="true"
        />
      </div>
      <!-- Tab: 线索分发 -->
      <div v-else-if="activeTab==='clue'" class="tab-pane broadcast-pane">
        <div class="section-label">新建线索</div>
        <input v-model="clueForm.title" class="field-input" placeholder="线索标题"/>
        <textarea v-model="clueForm.content" class="field-input" placeholder="线索内容..." rows="2" style="margin-top:6px;resize:vertical"/>
        <div class="section-label" style="margin-top:6px">文字主题</div>
        <div class="theme-grid">
          <div v-for="t in THEMES" :key="t" class="theme-card" :class="{ selected: clueForm.theme === t }" @click="clueForm.theme = t">
            <span class="theme-preview" :class="`text-art-${t}`">示例</span>
            <div class="theme-card-name">{{ t }}</div>
          </div>
        </div>
        <div class="clue-meta-row">
          <button class="sm-btn accent" @click="prepareClue" style="margin-left:auto">发放线索</button>
        </div>
        <div v-if="clueForm.title" class="clue-preview-wrap"><ClueCard :title="clueForm.title" :content="clueForm.content||'...'" :theme="clueForm.theme"/></div>
        <div style="margin-top:8px">
          <div class="preset-head">
            <div class="section-label">模组预设线索</div>
            <button class="sm-btn" @click="loadModulePresetClues">刷新</button>
          </div>
          <div v-if="modulePresetLoading" class="empty-hint">模组线索加载中...</div>
          <template v-else>
            <div v-for="preset in modulePresetClues" :key="preset.id" class="preset-clue-item">
              <div class="preset-clue-main">
                <div class="preset-clue-title">{{ preset.title || '未命名线索' }}</div>
                <div class="preset-clue-desc">{{ preset.content || '无内容' }}</div>
                <div class="preset-clue-meta">{{ preset.theme }} / {{ preset.revealMethod }}</div>
              </div>
              <button class="sm-btn" @click="usePresetClue(preset)">载入</button>
            </div>
            <div v-if="modulePresetClues.length === 0" class="empty-hint">当前模组没有可用线索块</div>
          </template>
        </div>
        <div v-if="localClues.length>0" style="margin-top:8px">
          <div class="section-label">线索库（点击编辑样式）</div>
          <GmClueLibrary
            :campaign-id="campaignId"
            :characters="characters"
            ref="gmClueLibraryRef"
          />
        </div>
      </div>
      <!-- Tab: 广播 -->
      <div v-else-if="activeTab==='broadcast'" class="tab-pane broadcast-pane">
        <div class="section-label">全员广播</div>
        <div class="broadcast-row">
          <textarea v-model="broadcastContent" class="broadcast-input" placeholder="输入公告内容，发送后自动添加 [GM公告] 前缀" rows="2"/>
          <button class="sm-btn accent" @click="sendBroadcast" :disabled="!broadcastContent.trim()">发送</button>
        </div>
      </div>
    </div>
  </div>

  <!-- 时间确认 -->
  <ElDialog v-model="showTimeConfirm" title="确认推进时间" width="420px">
    <div class="time-confirm-body">
      <p>将推进至 <strong>{{pendingTime ? formatTime(pendingTime) : ''}}</strong></p>
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
    <template #footer><button class="dlg-btn" @click="showTimeConfirm=false">取消</button><button class="dlg-btn accent" @click="confirmAdvanceTime">确认推进</button></template>
  </ElDialog>
  <!-- 新建场景 -->
  <ElDialog v-model="showNewScene" title="新建场景" width="420px">
    <div class="form-body">
      <label class="form-label">场景名称 *</label><input v-model="newScene.name" class="field-input" placeholder="如：酒馆大厅"/>
      <label class="form-label" style="margin-top:12px">场景类型</label>
      <div class="type-btns">
        <button v-for="t in (['spatial','virtual','lobby'] as const)" :key="t" class="type-btn" :class="{active:newScene.type===t}" @click="newScene.type=t">{{typeLabel[t]}}</button>
      </div>
      <label class="form-label" style="margin-top:12px">描述</label>
      <textarea v-model="newScene.description" class="field-input" rows="2" style="resize:vertical" placeholder="选填"/>
    </div>
    <template #footer><button class="dlg-btn" @click="showNewScene=false">取消</button><button class="dlg-btn accent" @click="createScene" :disabled="sceneLoading">{{sceneLoading?'创建中...':'创建场景'}}</button></template>
  </ElDialog>
  <!-- 强制移动 -->
  <ElDialog v-model="showForceMoveScene" title="强制移动角色" width="360px">
    <div class="form-body">
      <label class="form-label">选择角色</label>
      <select v-model="forceMoveCharId" class="field-input"><option value="">请选择</option><option v-for="c in characters" :key="c.id" :value="c.id">{{c.name}}</option></select>
      <label class="form-label" style="margin-top:12px">目标场景</label>
      <select v-model="forceMoveSceneId" class="field-input"><option value="">请选择</option><option v-for="s in spatialScenes" :key="s.id" :value="s.id">{{s.name}}</option></select>
    </div>
    <template #footer><button class="dlg-btn" @click="showForceMoveScene=false">取消</button><button class="dlg-btn accent" @click="submitForceMoveScene">确认移动</button></template>
  </ElDialog>
  <!-- 拒绝移动 -->
  <ElDialog v-model="showRejectDialog" title="拒绝移动申请" width="360px">
    <div class="form-body">
      <label class="form-label">拒绝原因（选填）</label>
      <textarea v-model="rejectReason" class="field-input" rows="2" placeholder="请输入拒绝理由..."/>
    </div>
    <template #footer><button class="dlg-btn" @click="showRejectDialog=false">取消</button><button class="dlg-btn danger" @click="submitRejectMove">确认拒绝</button></template>
  </ElDialog>
  <!-- 编辑场景 -->
  <ElDialog v-model="showEditScene" title="编辑场景" width="420px">
    <div class="form-body">
      <label class="form-label">场景名称 *</label><input v-model="editSceneForm.name" class="field-input"/>
      <label class="form-label" style="margin-top:12px">场景类型</label>
      <div class="type-btns">
        <button v-for="t in (['spatial','virtual','lobby'] as const)" :key="t" class="type-btn" :class="{active:editSceneForm.type===t}" @click="editSceneForm.type=t">{{typeLabel[t]}}</button>
      </div>
      <label class="form-label" style="margin-top:12px">历史可见性</label>
      <select v-model="editSceneForm.history_visibility" class="field-input">
        <option value="all">all — 可查看全部历史</option>
        <option value="recent">recent — 仅最近历史</option>
        <option value="none">none — 不可查看历史</option>
      </select>
      <label class="form-label" style="margin-top:12px">描述</label>
      <textarea v-model="editSceneForm.description" class="field-input" rows="2" style="resize:vertical"/>
    </div>
    <template #footer><button class="dlg-btn" @click="showEditScene=false">取消</button><button class="dlg-btn accent" @click="saveSceneEdit" :disabled="sceneEditLoading">保存</button></template>
  </ElDialog>
  <!-- 删除场景确认 -->
  <ElDialog v-model="showDeleteSceneConfirm" title="确认删除场景" width="360px">
    <p>确定删除场景 <strong>{{deletingSceneName}}</strong>？此操作不可撤销。场景中不能有角色。</p>
    <template #footer><button class="dlg-btn" @click="showDeleteSceneConfirm=false">取消</button><button class="dlg-btn danger" @click="confirmDeleteScene">确认删除</button></template>
  </ElDialog>
  <!-- 新建NPC -->
  <ElDialog v-model="showNewNpc" title="新建NPC" width="500px">
    <div class="form-body">
      <label class="form-label">名称 *</label><input v-model="newNpc.name" class="field-input" placeholder="NPC内部名称"/>
      <button class="advanced-toggle" @click="showNpcAdvanced=!showNpcAdvanced">{{showNpcAdvanced?'▲ 收起高级选项':'▼ 展开高级选项'}}</button>
      <template v-if="showNpcAdvanced">
        <label class="form-label" style="margin-top:10px">显示名称</label><input v-model="newNpc.display_name" class="field-input" placeholder="玩家看到的名字"/>
        <label class="form-label" style="margin-top:10px">描述</label><textarea v-model="newNpc.description" class="field-input" rows="2" style="resize:vertical"/>
        <label class="form-label" style="margin-top:10px">扮演提示</label><textarea v-model="newNpc.roleplay_hint" class="field-input" rows="2" style="resize:vertical"/>
        <div class="dyn-section"><div class="dyn-header"><span>属性</span><button class="sm-btn" @click="addAttr">+ 添加</button></div>
          <div v-for="(a,i) in newNpc.attributes" :key="i" class="dyn-row"><input v-model="a.key" class="field-input dyn-key" placeholder="属性名"/><input v-model="a.value" class="field-input dyn-val" type="number" placeholder="值"/><button class="sm-btn danger" @click="removeAttr(i)">×</button></div>
        </div>
        <div class="dyn-section"><div class="dyn-header"><span>技能</span><button class="sm-btn" @click="addSkill">+ 添加</button></div>
          <div v-for="(s,i) in newNpc.skills" :key="i" class="dyn-row"><input v-model="s.key" class="field-input dyn-key" placeholder="技能名"/><input v-model="s.value" class="field-input dyn-val" type="number" placeholder="值"/><button class="sm-btn danger" @click="removeSkill(i)">×</button></div>
        </div>
      </template>
    </div>
    <template #footer><button class="dlg-btn" @click="showNewNpc=false">取消</button><button class="dlg-btn accent" @click="createNpc" :disabled="npcLoading">{{npcLoading?'创建中...':'创建NPC'}}</button></template>
  </ElDialog>
  <!-- 线索范围 -->
  <ElDialog v-model="showClueTargetDialog" :title="clueDialogMode === 'create' ? '选择发放范围' : '再次发放线索'" width="360px">
    <div class="form-body">
      <div v-if="pendingRevealCluePreview" class="target-clue-preview">
        <div class="target-clue-title">{{ pendingRevealCluePreview.title }}</div>
        <div class="target-clue-desc">{{ pendingRevealCluePreview.content }}</div>
      </div>
      <label class="radio-row"><input v-model="clueTargetAll" type="radio" :value="true"/><span>全员可见</span></label>
      <label class="radio-row" style="margin-top:8px"><input v-model="clueTargetAll" type="radio" :value="false"/><span>仅指定角色</span></label>
      <select v-if="!clueTargetAll" v-model="clueTargetCharId" class="field-input" style="margin-top:8px"><option value="">请选择</option><option v-for="c in characters" :key="c.id" :value="c.id">{{c.name}}</option></select>
    </div>
    <template #footer><button class="dlg-btn" @click="resetClueTargetDialog">取消</button><button class="dlg-btn accent" @click="sendClue">确认发放</button></template>
  </ElDialog>
  <ElDialog v-model="showEditClueDialog" title="编辑线索" width="420px">
    <div class="form-body">
      <label class="form-label">线索标题 *</label><input v-model="editClueForm.title" class="field-input" placeholder="线索标题"/>
      <label class="form-label" style="margin-top:12px">线索内容 *</label><textarea v-model="editClueForm.content" class="field-input" rows="3" style="resize:vertical" placeholder="线索内容"/>
      <label class="form-label" style="margin-top:12px">文字主题</label>
      <div class="theme-grid">
        <div v-for="t in THEMES" :key="`edit-${t}`" class="theme-card" :class="{ selected: editClueForm.theme === t }" @click="editClueForm.theme = t">
          <span class="theme-preview" :class="`text-art-${t}`">示例</span>
          <div class="theme-card-name">{{ t }}</div>
        </div>
      </div>
    </div>
    <template #footer><button class="dlg-btn" @click="showEditClueDialog=false">取消</button><button class="dlg-btn accent" @click="saveClueEdit">保存</button></template>
  </ElDialog>
</template>

<style scoped>
.gm-console { background: var(--color-card-bg); border-bottom: 2px solid var(--color-accent); display: flex; flex-direction: column; }
.gm-console--standalone { border-bottom: none; height: 100%; overflow: hidden; }
.console-tabs { display: flex; border-bottom: 1px solid var(--color-card-border); padding: 0 var(--space-3); background: var(--color-page-bg); }
.console-tab { display: flex; align-items: center; gap: 5px; padding: var(--space-2) var(--space-3); border: none; background: none; cursor: pointer; color: var(--color-text-secondary); font-size: var(--text-xs); border-bottom: 2px solid transparent; transition: color var(--transition-fast); }
.console-tab.active { color: var(--color-accent); border-bottom-color: var(--color-accent); }
.console-body { padding: var(--space-3); max-height: 200px; overflow-y: auto; }
.tab-pane { display: flex; flex-direction: column; gap: var(--space-2); }
.time-display { margin-bottom: 4px; }
.time-big { font-size: 22px; font-weight: 700; font-family: var(--font-mono); color: var(--color-accent); }
.quick-btns { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.q-btn { padding: 4px 12px; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); cursor: pointer; font-size: var(--text-sm); }
.q-btn:hover { background: var(--color-card-border); }
.q-btn.accent { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.custom-row { display: flex; gap: var(--space-3); align-items: center; }
.delta-field { display: flex; align-items: center; gap: 4px; }
.delta-field input { width: 52px; padding: 4px 6px; border: 1px solid var(--color-input-border); border-radius: var(--radius-sm); text-align: center; font-size: var(--text-sm); background: var(--color-input-bg); }
.delta-field label { font-size: var(--text-xs); color: var(--color-text-muted); }
.pane-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.pane-count { font-size: var(--text-xs); color: var(--color-text-muted); }
.pane-actions { display: flex; gap: var(--space-2); }
.data-table { width: 100%; border-collapse: collapse; font-size: var(--text-xs); }
.data-table th { text-align: left; color: var(--color-text-muted); padding: 4px 6px; border-bottom: 1px solid var(--color-card-border); }
.data-table td { padding: 4px 6px; border-bottom: 1px solid var(--color-card-border); }
.td-name { font-weight: 500; }
.td-desc { color: var(--color-text-muted); max-width: 160px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.type-tag { font-size: 10px; padding: 1px 5px; border-radius: var(--radius-full); }
.type-tag.spatial { background: #eff6ff; color: #1d4ed8; }
.type-tag.virtual { background: #fdf4ff; color: #7e22ce; }
.type-tag.lobby { background: #f0fdf4; color: #15803d; }
.npc-cards { display: flex; flex-direction: column; gap: var(--space-2); }
.npc-card { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2); border: 1px solid var(--color-card-border); border-radius: var(--radius-md); }
.grid-pane { min-height: 320px; }
.grid-scene-select { width: 180px; }
.npc-avatar { width: 32px; height: 32px; border-radius: 50%; overflow: hidden; background: var(--color-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); font-weight: 600; flex-shrink: 0; }
.npc-avatar img { width: 100%; height: 100%; object-fit: cover; }
.npc-info { flex: 1; min-width: 0; }
.npc-name { font-size: var(--text-sm); font-weight: 500; }
.npc-desc { font-size: var(--text-xs); color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.broadcast-pane { gap: var(--space-2); }
.section-label { font-size: var(--text-xs); font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1px; }
.broadcast-row { display: flex; gap: var(--space-2); align-items: flex-end; }
.broadcast-input { flex: 1; padding: var(--space-2); border: 1px solid var(--color-input-border); border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm); resize: none; }
.clue-item { display: flex; gap: var(--space-2); align-items: flex-start; margin-bottom: 6px; }
.clue-item :deep(.clue-card) { flex: 1; }
.clue-actions { width: 96px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
.clue-audience { font-size: 10px; color: var(--color-text-muted); line-height: 1.4; }
.clue-meta-row { display: flex; align-items: center; gap: var(--space-2); margin-top: 6px; }
.theme-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 4px; }
.theme-card { border: 1px solid var(--color-card-border); border-radius: var(--radius-md); padding: 6px 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: border-color var(--transition-fast); }
.theme-card:hover { border-color: var(--color-accent); }
.theme-card.selected { border-color: var(--color-accent); box-shadow: 0 0 0 2px var(--color-accent); }
.theme-preview { font-size: 12px; font-weight: 600; line-height: 1.2; max-width: 100%; overflow: hidden; text-align: center; }
.theme-card-name { font-size: 9px; color: var(--color-text-muted); text-align: center; }
.preset-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.preset-clue-item { display: flex; gap: var(--space-2); align-items: center; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); padding: var(--space-2); margin-bottom: 6px; }
.preset-clue-main { flex: 1; min-width: 0; }
.preset-clue-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
.preset-clue-desc { font-size: var(--text-xs); color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
.preset-clue-meta { font-size: 10px; color: var(--color-text-muted); margin-top: 2px; text-transform: uppercase; }
.time-confirm-body { font-size: var(--text-sm); display: flex; flex-direction: column; gap: var(--space-2); }
.moves-hint { font-size: var(--text-xs); color: var(--color-text-muted); }
.moves-list { display: flex; flex-direction: column; gap: 4px; }
.moves-title { font-size: var(--text-xs); font-weight: 600; color: var(--color-text-secondary); margin-bottom: 4px; }
.move-item { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); }
.move-arrow { color: var(--color-text-muted); }
.move-time { color: var(--color-text-muted); }
.clue-preview-wrap { margin-top: 4px; }
.target-clue-preview { margin-bottom: 8px; padding: var(--space-2); border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); }
.target-clue-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
.target-clue-desc { font-size: var(--text-xs); color: var(--color-text-muted); margin-top: 4px; }
.pending-moves-panel { margin-top: var(--space-4); border-top: 1px solid var(--border-default); padding-top: var(--space-3); }
.pending-moves-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.move-preview-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 8px 0; border-bottom: 1px solid var(--border-default); }
.move-char { font-size: var(--text-sm); color: var(--text-primary); font-weight: var(--font-semibold); }
.move-scene { font-size: var(--text-xs); color: var(--text-muted); }
.empty-hint { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-3); }
.sm-btn { padding: 3px 10px; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); cursor: pointer; font-size: var(--text-xs); white-space: nowrap; }
.sm-btn.accent { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.sm-btn.danger { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
.sm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.form-body { display: flex; flex-direction: column; }
.form-label { font-size: var(--text-xs); color: var(--color-text-secondary); margin-bottom: 4px; }
.field-input { width: 100%; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-input-border); border-radius: var(--radius-md); background: var(--color-input-bg); color: var(--color-text-primary); font-size: var(--text-sm); box-sizing: border-box; }
.type-btns { display: flex; gap: var(--space-2); }
.type-btn { flex: 1; padding: var(--space-2); border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); cursor: pointer; font-size: var(--text-sm); }
.type-btn.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.advanced-toggle { margin-top: 10px; border: none; background: none; color: var(--color-accent); font-size: var(--text-xs); cursor: pointer; text-align: left; padding: 0; }
.dyn-section { margin-top: 10px; }
.dyn-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: var(--text-xs); color: var(--color-text-secondary); }
.dyn-row { display: flex; gap: var(--space-2); margin-bottom: 4px; }
.dyn-key { flex: 2; }
.dyn-val { flex: 1; }
.radio-row { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; font-size: var(--text-sm); }
.dlg-btn { padding: 6px 16px; border: 1px solid var(--color-card-border); border-radius: var(--radius-md); background: var(--color-page-bg); cursor: pointer; font-size: var(--text-sm); }
.dlg-btn.accent { background: var(--color-accent); color: #fff; border-color: var(--color-accent); margin-left: var(--space-2); }
.dlg-btn.danger { background: #b91c1c; color: #fff; border-color: #b91c1c; margin-left: var(--space-2); }
.move-info { flex: 1; }
.move-btns { display: flex; gap: var(--space-2); flex-shrink: 0; }
.force-move-row { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; margin-top: 6px; }
.force-move-row .field-input { flex: 1; min-width: 120px; }
.td-vis { font-size: var(--text-xs); color: var(--color-text-muted); white-space: nowrap; }
.td-actions { display: flex; gap: 4px; white-space: nowrap; }
</style>
