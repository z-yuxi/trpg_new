<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElDialog, ElMessage, ElSelect, ElOption, ElInput } from 'element-plus';
import RoomLayout from '../layouts/RoomLayout.vue';
import LeftSidebar from '../components/room/LeftSidebar.vue';
import ChatArea from '../components/room/ChatArea.vue';
import AssistantDesk from '../components/room/AssistantDesk.vue';
import GMConsole from '../components/room/GMConsole.vue';
import CharacterCardModal from '../components/room/CharacterCardModal.vue';
import TButton from '../components/base/TButton.vue';
import { useCampaignStore } from '../stores/campaign-store';
import { useAuthStore } from '../stores/auth-store';
import { useMessageStore } from '../stores/message-store';
import { socketClient } from '../socket/socket-client';
import { api } from '../utils/api';
import { createScene, joinScene, listObPermissions, grantObPermission as apiGrantObPermission, revokeObPermission as apiRevokeObPermission, listCampaignMembers } from '../api/campaigns';
import { getCharacter } from '../api/characters';
import { PLATFORM_PRESET_COMMAND_NAMES, type StoryTime } from '@trpg/shared';

const route = useRoute();
const router = useRouter();
const campaignStore = useCampaignStore();
const authStore = useAuthStore();
const messageStore = useMessageStore();

const campaignId = route.params.id as string;
const showGMConsole = ref(false);
const mobileView = ref<'chat' | 'scenes' | 'assistant' | 'gm'>('chat');

const scenes = ref<any[]>([]);
const npcs = ref<any[]>([]);
const commands = ref<any[]>([]);
const diceHistory = ref<any[]>([]);
const isGm = ref(false);
const globalTime = ref<StoryTime>({ day: 1, hour: 8, minute: 0 });
const characterId = ref('');
const pendingMoves = ref<any[]>([]);
const connections = ref<any[]>([]);
const currentSceneId = ref('');
const positionHistory = ref<Array<{ sceneId: string; storyTime?: any; messageId?: string }>>([]);
const roomCharacters = ref<Array<{ id: string; name: string; avatarUrl: string; sceneId: string; online: boolean; userId?: string; personalStoryTime?: StoryTime | null }>>([]);

const showCharacterDialog = ref(false);
const selectedCharacter = ref<any>(null);
const showForceMoveDialog = ref(false);
const selectedForceCharacterId = ref('');
const forceMoveTargetSceneId = ref('');
// 角色卡 Modal
const showCharCardModal = ref(false);
const charCardModalId = ref('');
const charCardModalName = ref('');
const charCardModalAttrs = ref<Record<string, number>>({});
const charCardModalIsOwner = ref(false);
// 跨团技能同步提示（本次会话内不重复）
const skillSyncDismissed = ref(false);

const unreadCounts = computed(() => messageStore.unreadCounts);
const currentScene = computed(() => scenes.value.find((scene) => scene.id === currentSceneId.value));

const activeSpatialCharacters = computed(() => {
  if (currentScene.value?.type !== 'spatial') return [];
  return roomCharacters.value.filter((char) => char.sceneId === currentSceneId.value);
});

const myVirtualSceneIds = ref<string[]>([]);

// 私密场新建
const showCreateVirtualSceneDialog = ref(false);
const newVirtualSceneName = ref('');

function handleCreateVirtualScene() {
  newVirtualSceneName.value = '';
  showCreateVirtualSceneDialog.value = true;
}

async function submitCreateVirtualScene() {
  const name = newVirtualSceneName.value.trim();
  if (!name) return;
  try {
    const scene = await createScene(campaignId, { name, type: 'virtual', description: '' });
    scenes.value.push(scene);
    switchScene(scene.id);
    showCreateVirtualSceneDialog.value = false;
    ElMessage.success(`私密场「${scene.name}」已创建`);
  } catch {
    ElMessage.error('创建私密场失败');
  }
}

// 邀请角色进入私密场
const showInviteDialog = ref(false);
const inviteSceneId = ref('');
const selectedInviteCharacterIds = ref<string[]>([]);
const inviteSceneName = computed(() => scenes.value.find((s) => s.id === inviteSceneId.value)?.name ?? '');

// 私密场 OB 旁听权限管理
const showObPermissionDialog = ref(false);
const obPermissionSceneId = ref('');
const obPermissionUserId = ref('');
const obPermissionLoading = ref(false);
const obPermissions = ref<Array<{ id: string; user_id: string; granted_by: string; granted_at: string }>>([]);
const obPermissionSceneName = computed(() => scenes.value.find((s) => s.id === obPermissionSceneId.value)?.name ?? '');
const roomUserIds = computed(() => {
  const set = new Set<string>();
  for (const char of roomCharacters.value) {
    if (char.userId) set.add(char.userId);
  }
  return [...set.values()];
});

function handleInviteToScene(sceneId: string) {
  inviteSceneId.value = sceneId;
  selectedInviteCharacterIds.value = [];
  showInviteDialog.value = true;
}

async function submitInvite() {
  if (!inviteSceneId.value || selectedInviteCharacterIds.value.length === 0) return;
  try {
    await Promise.all(
      selectedInviteCharacterIds.value.map((charId) =>
        api.post(`/campaigns/${campaignId}/scenes/${inviteSceneId.value}/join`, { character_id: charId })
      )
    );
    await fetchMyVirtualScenes();
    showInviteDialog.value = false;
    ElMessage.success('邀请成功');
  } catch {
    ElMessage.error('邀请失败');
  }
}

async function loadObPermissions() {
  if (!obPermissionSceneId.value) return;
  obPermissionLoading.value = true;
  try {
    const data = await listObPermissions(campaignId, obPermissionSceneId.value);
    obPermissions.value = data ?? [];
  } catch {
    obPermissions.value = [];
    ElMessage.error('加载 OB 权限失败');
  } finally {
    obPermissionLoading.value = false;
  }
}

async function handleManageObPermissions(sceneId: string) {
  obPermissionSceneId.value = sceneId;
  obPermissionUserId.value = '';
  showObPermissionDialog.value = true;
  await loadObPermissions();
}

async function submitGrantObPermission() {
  const userId = obPermissionUserId.value.trim();
  if (!obPermissionSceneId.value || !userId) return;
  try {
    await apiGrantObPermission(campaignId, obPermissionSceneId.value, userId);
    ElMessage.success('已授予 OB 旁听权限');
    obPermissionUserId.value = '';
    await loadObPermissions();
  } catch {
    ElMessage.error('授予权限失败');
  }
}

async function revokeObPermission(userId: string) {
  if (!obPermissionSceneId.value || !userId) return;
  try {
    await apiRevokeObPermission(campaignId, obPermissionSceneId.value, userId);
    ElMessage.success('已撤销 OB 旁听权限');
    await loadObPermissions();
  } catch {
    ElMessage.error('撤销权限失败');
  }
}

async function fetchMyVirtualScenes() {
  try {
    const ids = await api.get<string[]>(`/campaigns/${campaignId}/my-virtual-scenes`);
    myVirtualSceneIds.value = ids ?? [];
  } catch {
    myVirtualSceneIds.value = [];
  }
}

const moveTargetOptions = computed(() => scenes.value.filter((scene) => scene.type === 'spatial' || scene.type === 'lobby'));

const prefillCommand = ref('');
const selectedSenderIdentity = ref('');
const mobileAssistantTab = ref<'cmds' | 'map' | 'dice' | 'secret' | 'broadcast'>('cmds');

const myCharacter = computed(() =>
  roomCharacters.value.find((char) => char.id === characterId.value) ?? null
);

function handleFillCommand(cmd: string) {
  prefillCommand.value = cmd;
  // Reset after a tick so the watcher fires again if the same command is used twice
  setTimeout(() => { prefillCommand.value = ''; }, 50);
}

function handleAssistantBroadcast(content: string) {
  const text = content.trim();
  if (!text) return;
  socketClient.sendMessage({
    content: `[GM公告] ${text}`,
    message_type: 'announcement',
  });
}

function handleMobileAssistantOpen(tab: 'cmds' | 'map' | 'dice' | 'secret' | 'broadcast') {
  mobileAssistantTab.value = tab;
}

/** 平台预置命令的参数提示 */
const PRESET_PARAM_HINTS: Record<string, string> = {
  ra: '<属性名>',
  rc: '<技能名> [hard|extreme]',
  sc: '',
  en: '<技能名>',
  ti: '',
  li: '<技能名>',
  init: '',
  ds: '<伤害公式>',
  roll: '<骰子表达式>',
  check: '<阈值>',
  initiative: '',
  r: '<骰子表达式>',
  rh: '<骰子表达式>',
  nn: '<旁白内容>',
};

function normalizeRulesetCommands(raw: unknown): Array<{ name: string; description: string; paramHint?: string }> {
  const mapped = new Map<string, { name: string; description: string; paramHint?: string }>();

  PLATFORM_PRESET_COMMAND_NAMES.forEach((name) => {
    mapped.set(name, { name, description: '平台预置命令', paramHint: PRESET_PARAM_HINTS[name] });
  });

  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const command = item as { name?: string; description?: string };
      if (!command.name) return;
      mapped.set(command.name, {
        name: command.name,
        description: command.description ?? mapped.get(command.name)?.description ?? '',
        paramHint: mapped.get(command.name)?.paramHint,
      });
    });
    return [...mapped.values()];
  }

  if (raw && typeof raw === 'object') {
    Object.entries(raw as Record<string, unknown>).forEach(([name, value]) => {
      const description = typeof value === 'string'
        ? value
        : (value as { description?: string } | null)?.description ?? mapped.get(name)?.description ?? '';
      mapped.set(name, { name, description });
    });
  }

  return [...mapped.values()];
}

async function loadScenes() {
  try {
    scenes.value = await api.get<any[]>(`/campaigns/${campaignId}/scenes`);
  } catch { /* ignore */ }
}

function handleAnnounceTime() {
  const value = window.prompt('输入要插入的时间标签（HH:MM）', `${String(globalTime.value.hour).padStart(2, '0')}:${String(globalTime.value.minute).padStart(2, '0')}`);
  if (!value) return;
  if (!/^\d{1,2}:\d{2}$/.test(value)) {
    ElMessage.error('时间格式应为 HH:MM');
    return;
  }
  socketClient.gmAnnounceTime(value);
}

async function handleSceneCreated(s: any) {
  // 同步更新（Vue 批量处理，避免中间状态导致私密场/公共场 computed 漏掉新场景）
  scenes.value.push(s);
  switchScene(s.id);
  // 后台静默刷新，保证数据与服务器一致
  loadScenes();
}

function switchScene(sceneId: string) {
  currentSceneId.value = sceneId;
  messageStore.setCurrentScene(sceneId);
  socketClient.subscribeScene(sceneId);
  positionHistory.value = [
    ...positionHistory.value.filter((e) => e.sceneId !== sceneId),
    { sceneId, storyTime: globalTime.value },
  ];
}

async function loadRoomCharacters() {
  try {
    const data = await api.get<any[]>(`/campaigns/${campaignId}/characters`);
    roomCharacters.value = data.map((item: any) => ({
      id: item.id,
      name: item.name,
      avatarUrl: item.avatar_url || '',
      sceneId: item.scene_id || '',
      online: !!item.online,
      userId: item.user_id,
      personalStoryTime: item.personal_story_time ?? null,
    }));

    const myChar = data.find((item: any) => item.user_id === authStore.userId);
    if (myChar?.id) {
      characterId.value = myChar.id;
      if (!currentSceneId.value && myChar.scene_id) {
        switchScene(myChar.scene_id);
      }
      if (!skillSyncDismissed.value) {
        checkSkillSync(myChar.id);
      }
    }
  } catch {
    ElMessage.error('角色列表加载失败');
  }
}

async function checkSkillSync(charId: string) {
  try {
    const [template, instance] = await Promise.all([
      api.get<any>(`/characters/${charId}`),
      api.get<any>(`/characters/${charId}/instance?campaign_id=${campaignId}`),
    ]);
    const growthMarks: Record<string, boolean> = instance.skill_growth_marks ?? {};
    if (Object.keys(growthMarks).length > 0) {
      const markedSkills = Object.keys(growthMarks).join('、');
      ElMessage({
        type: 'warning',
        duration: 0,
        showClose: true,
        message: `角色有未同步的技能成长标记（${markedSkills}），可使用 /ti 指令进行幕间成长`,
      });
      skillSyncDismissed.value = true;
    }
  } catch { /* ignore */ }
}

async function viewCharacter(characterIdToView: string) {
  const char = roomCharacters.value.find(c => c.id === characterIdToView);
  if (char) {
    charCardModalId.value = characterIdToView;
    charCardModalName.value = char.name;
    charCardModalIsOwner.value = char.userId === authStore.userId;
    try {
      const data = await api.get<any>(`/campaigns/${campaignId}/characters/${characterIdToView}`);
      charCardModalAttrs.value = data.attributes ?? {};
    } catch { /* ignore, modal can still show */ }
    showCharCardModal.value = true;
    return;
  }
  try {
    const data = await api.get<any>(`/campaigns/${campaignId}/characters/${characterIdToView}`);
    selectedCharacter.value = data;
    showCharacterDialog.value = true;
  } catch {
    ElMessage.error('无法查看该角色卡');
  }
}

function openForceMove(characterIdToMove: string) {
  selectedForceCharacterId.value = characterIdToMove;
  forceMoveTargetSceneId.value = currentSceneId.value;
  showForceMoveDialog.value = true;
}

async function submitForceMove() {
  if (!selectedForceCharacterId.value || !forceMoveTargetSceneId.value) return;
  try {
    const moved = await api.post<any>(`/campaigns/${campaignId}/force-move`, {
      character_id: selectedForceCharacterId.value,
      to_scene_id: forceMoveTargetSceneId.value,
    });
    roomCharacters.value = roomCharacters.value.map((char) => {
      if (char.id !== moved.character_id) return char;
      return { ...char, sceneId: moved.to_scene_id };
    });
    ElMessage.success('已执行强制移动');
    showForceMoveDialog.value = false;
  } catch (error: any) {
    ElMessage.error(error?.message || '强制移动失败');
  }
}

onMounted(async () => {
  socketClient.setToken(authStore.token);

  try {
    const campaign = await api.get<any>(`/campaigns/${campaignId}`);
    campaignStore.setCurrentCampaign(campaign);
    isGm.value = campaign.gm_user_id === authStore.userId;

    if (campaign.global_story_time) {
      try {
        globalTime.value = JSON.parse(campaign.global_story_time);
      } catch {
        // ignore invalid json
      }
    }

    if (campaign.ruleset_id) {
      try {
        const ruleset = await api.get<any>(`/rulesets/${campaign.ruleset_id}`);
        commands.value = normalizeRulesetCommands(ruleset.commands);
      } catch { /* ignore */ }
    }

    await loadScenes();
    if (!currentSceneId.value) {
      const firstScene = scenes.value[0]?.id;
      if (firstScene) switchScene(firstScene);
    }

    const npcsData = await api.get<any[]>(`/campaigns/${campaignId}/npcs`).catch(() => []);
    npcs.value = npcsData;

    await loadRoomCharacters();
    if (!isGm.value) await fetchMyVirtualScenes();

    // GM: 初始加载待审批移动申请数量（badge 徽章）
    if (isGm.value) {
      try {
        const moves = await api.get<any[]>(`/campaigns/${campaignId}/moves?status=pending`);
        pendingMoves.value = moves ?? [];
      } catch { /* ignore */ }
    }
  } catch {
    // ignore bootstrap errors
  }

  socketClient.connectRoom();
  socketClient.joinRoom(campaignId, characterId.value);
  if (currentSceneId.value) socketClient.subscribeScene(currentSceneId.value);

  socketClient.onTimeTagAnnounced((data) => {
    const match = String(data.time_label ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return;
    globalTime.value = {
      ...globalTime.value,
      hour: parseInt(match[1], 10),
      minute: parseInt(match[2], 10),
    };
  });

  socketClient.onPositionChanged((data) => {
    roomCharacters.value = roomCharacters.value.map((char) => {
      if (char.id !== data.character_id) return char;
      return { ...char, sceneId: data.to_scene_id };
    });

    if (data.character_id === characterId.value) {
      switchScene(data.to_scene_id);
    }

    // 移动执行后，从 pendingMoves 中移除（已被审批/执行）
    if (isGm.value && data.move_id) {
      pendingMoves.value = pendingMoves.value.filter((m) => m.id !== data.move_id);
    }
  });

  // GM: 监听新移动申请到达，更新 badge
  if (isGm.value) {
    const roomSocket = socketClient.getRoomSocket() as any;
    roomSocket?.on?.('move_requested', (data: any) => {
      if (data?.move) pendingMoves.value.push(data.move);
    });
    roomSocket?.on?.('move_cancelled', (data: any) => {
      if (data?.move_id) pendingMoves.value = pendingMoves.value.filter((m) => m.id !== data.move_id);
    });
  }

  // 角色状态同步（HP/MP/SAN 等）
  (socketClient as any).on?.('character_state_sync', (data: {
    character_id: string;
    derived_current?: Record<string, { current: number; max: number }>;
    truncated_fields?: string[];
  }) => {
    if (data.character_id === characterId.value && data.truncated_fields?.length) {
      ElMessage.warning(`${data.truncated_fields.join('、')} 超过上限，已自动截断`);
    }
  });

  // 私密场 OB 授权变更通知（发给被授权/被撤销用户）
  const roomSocket = socketClient.getRoomSocket() as any;
  roomSocket?.on?.('ob_permission_granted', async (data: { scene_id?: string; user_id?: string }) => {
    if (data?.user_id && data.user_id !== authStore.userId) return;
    ElMessage.info('你获得了一个私密场的 OB 旁听权限');
    await fetchMyVirtualScenes();
  });
  roomSocket?.on?.('ob_permission_revoked', async (data: { scene_id?: string; user_id?: string }) => {
    if (data?.user_id && data.user_id !== authStore.userId) return;
    ElMessage.warning('你的某个私密场 OB 旁听权限已被撤销');
    await fetchMyVirtualScenes();
    const current = scenes.value.find((s) => s.id === currentSceneId.value);
    if (current?.type === 'virtual') {
      const allow = new Set(myVirtualSceneIds.value);
      if (!allow.has(current.id)) {
        const fallback = scenes.value.find((s) => s.type === 'spatial' || s.type === 'lobby') ?? scenes.value[0];
        if (fallback?.id) switchScene(fallback.id);
      }
    }
  });
});

onUnmounted(() => {
  socketClient.leaveRoom();
  socketClient.disconnect();
});
</script>

<template>
  <div style="height:100vh;overflow:hidden">
    <RoomLayout
      :campaign-name="campaignStore.currentCampaign?.name ?? '加载中...'"
      :room-code="campaignStore.currentCampaign?.room_code"
      :is-gm="isGm"
      :mobile-view="mobileView"
      :global-time="globalTime"
      :campaign-id="campaignId"
      :pending-moves-count="pendingMoves.length"
      :npcs="npcs"
      @toggle-gm-console="showGMConsole = !showGMConsole"
      @export-log="router.push(`/room/${campaignId}/export`)"
      @mobile-assistant-open="handleMobileAssistantOpen"
      @update:mobile-view="mobileView = $event"
      @announce-time="handleAnnounceTime"
      @play-as-npc="(id) => { selectedSenderIdentity = `npc:${id}`; }"
      @open-approve="showGMConsole = true"
    >
      <template #gm-console>
        <transition name="gm-slide">
          <GMConsole
            v-if="isGm && (showGMConsole || mobileView === 'gm')"
            :campaign-id="campaignId"
            :global-story-time="globalTime"
            :scenes="scenes"
            :npcs="npcs"
            :characters="roomCharacters.map(c => ({ id: c.id, name: c.name, sceneId: c.sceneId }))"
            @scene-created="handleSceneCreated"
            @npc-created="(n) => npcs.push(n)"
            @play-as-npc="(id) => { selectedSenderIdentity = `npc:${id}`; showGMConsole = false; }"
          />
        </transition>
      </template>

      <template #left-sidebar>
        <LeftSidebar
          :scenes="scenes"
          :current-scene-id="currentSceneId"
          :characters="activeSpatialCharacters"
          :connections="connections"
          :enable-connections="false"
          :unread-counts="unreadCounts"
          :is-gm="isGm"
          :my-virtual-scene-ids="myVirtualSceneIds"
          :global-time="globalTime"
          :position-history="positionHistory"
          @scene-select="switchScene"
          @gm-view-character="viewCharacter"
          @gm-force-move="openForceMove"
          @create-virtual-scene="handleCreateVirtualScene"
          @invite-to-scene="handleInviteToScene"
          @manage-ob-permissions="handleManageObPermissions"
        />
      </template>
      <template #chat-area>
        <ChatArea
          :prefill-text="prefillCommand"
          :is-gm="isGm"
          :campaign-id="campaignId"
          :characters="roomCharacters.map((c) => ({ id: c.id, name: c.name }))"
          :current-scene-type="currentScene?.type"
          :my-character="myCharacter ? { id: myCharacter.id, name: myCharacter.name, avatarUrl: myCharacter.avatarUrl } : null"
          :roleplayable-npcs="npcs.map((npc) => ({ id: npc.id, name: npc.name, avatarUrl: npc.avatar_url }))"
          :auth-display-name="authStore.nickname"
          :selected-identity-key="selectedSenderIdentity"
          :ruleset-commands="commands"
        />
      </template>
      <template #right-desk>
        <AssistantDesk
          :campaign-id="campaignId"
          :commands="commands"
          :scenes="scenes"
          :room-characters="roomCharacters"
          :current-scene-id="currentSceneId"
          :npcs="npcs.map((npc) => ({ id: npc.id, name: npc.name, display_name: npc.display_name }))"
          :is-gm="isGm"
          :initial-tab="mobileAssistantTab"
          @fill-command="handleFillCommand"
          @broadcast="handleAssistantBroadcast"
        />
      </template>
    </RoomLayout>

    <ElDialog v-model="showCharacterDialog" title="角色卡" width="460px">
      <div v-if="selectedCharacter" class="character-detail">
        <p><strong>角色名：</strong>{{ selectedCharacter.name }}</p>
        <p><strong>规则包：</strong>{{ selectedCharacter.ruleset_id }}</p>
        <p><strong>背景：</strong>{{ selectedCharacter.background || '暂无' }}</p>
      </div>
    </ElDialog>

    <ElDialog v-model="showForceMoveDialog" title="强制移动角色" width="420px">
      <ElSelect v-model="forceMoveTargetSceneId" placeholder="选择目标场景" style="width:100%">
        <ElOption
          v-for="scene in moveTargetOptions"
          :key="scene.id"
          :label="scene.name"
          :value="scene.id"
        />
      </ElSelect>
      <template #footer>
        <TButton type="secondary" @click="showForceMoveDialog = false">取消</TButton>
        <TButton type="primary" @click="submitForceMove">确认移动</TButton>
      </template>
    </ElDialog>

    <!-- 新建私密场 -->
    <ElDialog v-model="showCreateVirtualSceneDialog" title="新建私密场" width="380px">
      <ElInput
        v-model="newVirtualSceneName"
        placeholder="请输入私密场名称"
        maxlength="20"
        show-word-limit
        @keyup.enter="submitCreateVirtualScene"
      />
      <template #footer>
        <TButton type="secondary" @click="showCreateVirtualSceneDialog = false">取消</TButton>
        <TButton type="primary" :disabled="!newVirtualSceneName.trim()" @click="submitCreateVirtualScene">创建</TButton>
      </template>
    </ElDialog>

    <!-- 邀请角色进入私密场 -->
    <ElDialog v-model="showInviteDialog" :title="`邀请进入「${inviteSceneName}」`" width="420px">
      <ElSelect
        v-model="selectedInviteCharacterIds"
        multiple
        placeholder="选择要邀请的角色"
        style="width:100%"
      >
        <ElOption
          v-for="char in roomCharacters"
          :key="char.id"
          :label="char.name"
          :value="char.id"
        />
      </ElSelect>
      <template #footer>
        <TButton type="secondary" @click="showInviteDialog = false">取消</TButton>
        <TButton type="primary" :disabled="selectedInviteCharacterIds.length === 0" @click="submitInvite">确认邀请</TButton>
      </template>
    </ElDialog>

    <!-- 管理私密场 OB 旁听权限 -->
    <ElDialog v-model="showObPermissionDialog" :title="`OB 权限管理：${obPermissionSceneName}`" width="520px">
      <div class="ob-permission-panel">
        <div class="ob-permission-row">
          <ElSelect
            v-model="obPermissionUserId"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="输入或选择 user_id"
            style="width: 100%"
          >
            <ElOption
              v-for="uid in roomUserIds"
              :key="uid"
              :label="uid"
              :value="uid"
            />
          </ElSelect>
          <TButton type="primary" :disabled="!obPermissionUserId.trim()" @click="submitGrantObPermission">授权</TButton>
        </div>

        <div class="ob-permission-list" v-loading="obPermissionLoading">
          <div v-if="obPermissions.length === 0" class="ob-empty">当前暂无 OB 旁听授权</div>
          <div v-for="item in obPermissions" :key="item.id" class="ob-item">
            <div class="ob-item-main">
              <div class="ob-item-user">{{ item.user_id }}</div>
              <div class="ob-item-meta">授权人 {{ item.granted_by }} · {{ item.granted_at }}</div>
            </div>
            <TButton type="danger" @click="revokeObPermission(item.user_id)">撤销</TButton>
          </div>
        </div>
      </div>
      <template #footer>
        <TButton type="secondary" @click="showObPermissionDialog = false">关闭</TButton>
      </template>
    </ElDialog>

    <!-- 团内角色卡状态 Modal -->
    <CharacterCardModal
      :visible="showCharCardModal"
      :character-id="charCardModalId"
      :campaign-id="campaignId"
      :character-name="charCardModalName"
      :character-attrs="charCardModalAttrs"
      :is-gm="isGm"
      :is-owner="charCardModalIsOwner"
      @close="showCharCardModal = false"
      @updated="() => { showCharCardModal = false; }"
    />
  </div>
</template>

<style scoped>
.character-detail p { margin: 6px 0; color: var(--color-text-secondary); }
.gm-slide-enter-active,
.gm-slide-leave-active { transition: max-height 0.25s ease, opacity 0.2s ease; overflow: hidden; }
.gm-slide-enter-from,
.gm-slide-leave-to { max-height: 0; opacity: 0; }
.gm-slide-enter-to,
.gm-slide-leave-from { max-height: 260px; opacity: 1; }

.ob-permission-panel { display: grid; gap: 12px; }
.ob-permission-row { display: flex; gap: 8px; align-items: center; }
.ob-permission-list {
  display: grid;
  gap: 8px;
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: 8px;
}
.ob-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-sm);
}
.ob-item-main { min-width: 0; }
.ob-item-user { font-size: var(--text-sm); color: var(--color-text-primary); font-weight: 600; }
.ob-item-meta { font-size: var(--text-xs); color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ob-empty { font-size: var(--text-sm); color: var(--color-text-muted); text-align: center; padding: 16px 0; }
</style>
