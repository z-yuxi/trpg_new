<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { ElDialog, ElMessage, ElMessageBox } from 'element-plus';
import SvgIcon from '../SvgIcon.vue';
import ClueCard from '../ClueCard.vue';
import GridMap from './GridMap.vue';
import TrajectoryMatrix from './TrajectoryMatrix.vue';
import GmClueLibrary from './GmClueLibrary.vue';
import GmNpcControl from './GmNpcControl.vue';
import GmBroadcast from './GmBroadcast.vue';
import GmTimeControl from './GmTimeControl.vue';
import GmMoveApproval from './GmMoveApproval.vue';
import GmSceneManager from './GmSceneManager.vue';
import type { StoryTime, Scene, CampaignNpc } from '@trpg/shared';
import { socketClient } from '../../socket/socket-client';
import { listClues, createClue, deleteClue as apiDeleteClue, updateGridMapSettings, getTrajectoryMatrix } from '../../api/campaigns';
import { getModule } from '../../api/modules';
import { api } from '../../utils/api';
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

const activeTab = ref<'time' | 'moves' | 'scenes' | 'npcs' | 'clue' | 'broadcast' | 'grid' | 'trajectory'>(props.defaultTab ?? 'time');
const activeGridSceneId = ref('');
const gridMapRef = ref<{ reload: () => void } | null>(null);
const playerDragEnabled = ref(false);

// ─── Tab 1: 时间控制（已提取至 GmTimeControl.vue）───────────────────────────
// ─── Tab 2: 场景管理 + 移动审批（已提取至 GmSceneManager.vue / GmMoveApproval.vue）─
// ─── Tab 3: NPC 控制（已提取至 GmNpcControl.vue）────────────────────────────
// ─── Tab 4: 广播（已提取至 GmBroadcast.vue）─────────────────────────────────

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
    const campaign = await api.get<{ module_id?: string | null }>(`/campaigns/${props.campaignId}`);
    if (!campaign.module_id) { modulePresetClues.value = []; return; }

    const moduleData = await getModule(campaign.module_id) as { content?: string | null };
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
    localClues.value = await listClues(props.campaignId) as CampaignClueRecord[];
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
      const clue = clueTargetAll.value
        ? await api.put<CampaignClueRecord>(`/campaigns/${props.campaignId}/clues/${pendingRevealClueId.value}`, { is_revealed: true, revealed_to: null })
        : await api.post<CampaignClueRecord>(`/campaigns/${props.campaignId}/clues/${pendingRevealClueId.value}/reveal`, { character_ids: visibleTo });
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

    const clue = await createClue(props.campaignId, {
      title: clueForm.value.title,
      content: clueForm.value.content,
      theme: clueForm.value.theme,
      is_revealed: true,
      revealed_to: visibleTo,
    });
    localClues.value.unshift(clue as CampaignClueRecord);
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
    const updated = await api.put<CampaignClueRecord>(`/campaigns/${props.campaignId}/clues/${editingClueId.value}`, {
      title: editClueForm.value.title,
      content: editClueForm.value.content,
      theme: editClueForm.value.theme,
    });
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
    await apiDeleteClue(props.campaignId, clue.id);
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

watch(activeGridScene, async (scene) => {
  if (!scene) { playerDragEnabled.value = false; return; }
  try {
    const map = await api.get<{ allow_player_token_drag?: boolean }>(
      `/campaigns/${props.campaignId}/scenes/${scene.id}/grid-map`
    );
    playerDragEnabled.value = map.allow_player_token_drag ?? false;
  } catch {
    playerDragEnabled.value = false;
  }
});

async function togglePlayerDrag() {
  const scene = activeGridScene.value;
  if (!scene) return;
  const next = !playerDragEnabled.value;
  await updateGridMapSettings(props.campaignId, scene.id, { allow_player_token_drag: next });
  playerDragEnabled.value = next;
  gridMapRef.value?.reload();
}

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
    trajectoryData.value = await getTrajectoryMatrix(props.campaignId) as TrajectoryMatrixResponse;
  } catch { /* ignore */ }
  finally { trajectoryLoading.value = false; }
}

onMounted(() => {
  loadClues();
  loadModulePresetClues();
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
      <!-- Tab 1: 时间（已提取至 GmTimeControl.vue） -->
      <GmTimeControl v-if="activeTab==='time'" :campaign-id="campaignId" :global-story-time="globalStoryTime" />
      <!-- Tab 2: 移动审批（已提取至 GmMoveApproval.vue） -->
      <GmMoveApproval v-else-if="activeTab==='moves'" :campaign-id="campaignId" :scenes="scenes" :characters="characters" />
      <!-- Tab 3: 场景（已提取至 GmSceneManager.vue） -->
      <GmSceneManager v-else-if="activeTab==='scenes'" :campaign-id="campaignId" :scenes="scenes" :characters="characters" @scene-created="(s) => emit('scene-created', s)" />
      <!-- Tab 4: NPC -->
      <div v-else-if="activeTab==='npcs'" class="tab-pane">
        <GmNpcControl
          :campaign-id="campaignId"
          :npcs="npcs"
          @npc-created="(npc) => emit('npc-created', npc)"
          @play-as-npc="(id) => emit('play-as-npc', id)"
        />
      </div>
      <div v-else-if="activeTab==='grid'" class="tab-pane grid-pane">
        <div class="pane-header">
          <span class="pane-count">网格地图 V1</span>
          <select v-model="activeGridSceneId" class="field-input grid-scene-select">
            <option v-for="scene in spatialScenes" :key="scene.id" :value="scene.id">{{ scene.name }}</option>
          </select>
          <button
            class="sm-btn"
            :class="{ active: playerDragEnabled }"
            :title="playerDragEnabled ? '关闭玩家拖拽' : '允许玩家拖拽自己的 Token'"
            @click="togglePlayerDrag"
          >{{ playerDragEnabled ? '🔓 拖拽:开' : '🔒 拖拽:关' }}</button>
        </div>
        <GridMap
          v-if="activeGridScene"
          ref="gridMapRef"
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
      <div v-else-if="activeTab==='broadcast'" class="tab-pane">
        <GmBroadcast />
      </div>
    </div>
  </div>

  <!-- 时间确认对话框已移至 GmTimeControl.vue -->
  <!-- 新建场景、编辑场景、删除场景对话框已移至 GmSceneManager.vue -->
  <!-- 拒绝移动对话框已移至 GmMoveApproval.vue -->
  <!-- 新建NPC 对话框已移至 GmNpcControl.vue -->
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
.sm-btn.danger { background: rgba(184, 84, 80, 0.08); color: #A04743; border-color: rgba(184, 84, 80, 0.3); }
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
.dlg-btn.danger { background: #A04743; color: #fff; border-color: #A04743; margin-left: var(--space-2); }
.move-info { flex: 1; }
.move-btns { display: flex; gap: var(--space-2); flex-shrink: 0; }
.force-move-row { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; margin-top: 6px; }
.force-move-row .field-input { flex: 1; min-width: 120px; }
.td-vis { font-size: var(--text-xs); color: var(--color-text-muted); white-space: nowrap; }
.td-actions { display: flex; gap: 4px; white-space: nowrap; }
</style>
