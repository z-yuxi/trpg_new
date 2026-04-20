<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElDialog, ElMessage, ElSelect, ElOption } from 'element-plus';
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

async function fetchMyVirtualScenes() {
  try {
    const { api } = await import('../utils/api');
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
  const res = await fetch(`/api/campaigns/${campaignId}/scenes`, {
    headers: { Authorization: `Bearer ${authStore.token}` },
  });
  if (res.ok) scenes.value = await res.json();
}

function handleAdvanceTime(minutes: number) {
  const base = globalTime.value ?? { day: 1, hour: 8, minute: 0 };
  const total = base.minute + minutes + base.hour * 60 + (base.day - 1) * 1440;
  const newTime = { day: Math.floor(total / 1440) + 1, hour: Math.floor((total % 1440) / 60), minute: total % 60 };
  socketClient.gmAdvanceTime({ custom_time: newTime });
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
    const res = await fetch(`/api/campaigns/${campaignId}/characters`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
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
      // 检测跨团技能同步（模板 vs 实例，差异 >= 5 点）
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
    const [templateRes, instanceRes] = await Promise.all([
      fetch(`/api/characters/${charId}`, { headers: { Authorization: `Bearer ${authStore.token}` } }),
      fetch(`/api/characters/${charId}/instance?campaign_id=${campaignId}`, { headers: { Authorization: `Bearer ${authStore.token}` } }),
    ]);
    if (!templateRes.ok || !instanceRes.ok) return;
    const template = await templateRes.json();
    const instance = await instanceRes.json();
    const templateSkills: Record<string, number> = template.skills ?? {};
    // instance 没有单独的 skills（存在模板中），检测 derived_current 是否过期
    // 这里主要对比技能 growth_marks：若有待成长标记，提示同步
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
  // 如果是团成员角色，优先打开团内角色卡 Modal
  const char = roomCharacters.value.find(c => c.id === characterIdToView);
  if (char) {
    charCardModalId.value = characterIdToView;
    charCardModalName.value = char.name;
    charCardModalIsOwner.value = char.userId === authStore.userId;
    // 尝试加载属性
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/characters/${characterIdToView}`, {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        charCardModalAttrs.value = data.attributes ?? {};
      }
    } catch { /* ignore, modal can still show */ }
    showCharCardModal.value = true;
    return;
  }
  // 回退：显示简单对话框
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/characters/${characterIdToView}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (!res.ok) throw new Error('角色卡加载失败');
    selectedCharacter.value = await res.json();
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
    const res = await fetch(`/api/campaigns/${campaignId}/force-move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authStore.token}` },
      body: JSON.stringify({
        character_id: selectedForceCharacterId.value,
        to_scene_id: forceMoveTargetSceneId.value,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '强制移动失败');
    }
    const moved = await res.json();
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
    const campaignRes = await fetch(`/api/campaigns/${campaignId}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (campaignRes.ok) {
      const campaign = await campaignRes.json();
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
        const rulesetRes = await fetch(`/api/rulesets/${campaign.ruleset_id}`).catch(() => null);
        if (rulesetRes?.ok) {
          const ruleset = await rulesetRes.json();
          commands.value = normalizeRulesetCommands(ruleset.commands);
        }
      }
    }

    await loadScenes();
    if (!currentSceneId.value) {
      const firstScene = scenes.value[0]?.id;
      if (firstScene) switchScene(firstScene);
    }

    const npcsRes = await fetch(`/api/campaigns/${campaignId}/npcs`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (npcsRes.ok) npcs.value = await npcsRes.json();

    await loadRoomCharacters();
    if (!isGm.value) await fetchMyVirtualScenes();
  } catch {
    // ignore bootstrap errors
  }

  socketClient.connectRoom();
  socketClient.joinRoom(campaignId, characterId.value);
  if (currentSceneId.value) socketClient.subscribeScene(currentSceneId.value);

  socketClient.onTimeAdvanced((data) => {
    globalTime.value = data.new_time;
    // 检查是否有自己角色的移动被执行，弹出"到达场景"提示
    const executedMoves: Array<{ character_id: string; to_scene_id: string }> = data.executed_moves ?? data.triggered_moves ?? [];
    const myMove = executedMoves.find((m) => m.character_id === characterId.value);
    if (myMove) {
      const targetScene = scenes.value.find((s) => s.id === myMove.to_scene_id);
      const sceneName = targetScene?.name ?? '目标场景';
      ElMessage.success(`你已到达「${sceneName}」`);
    }
  });

  socketClient.onPositionChanged((data) => {
    roomCharacters.value = roomCharacters.value.map((char) => {
      if (char.id !== data.character_id) return char;
      return { ...char, sceneId: data.to_scene_id };
    });

    if (data.character_id === characterId.value) {
      switchScene(data.to_scene_id);
    }
  });

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
      @advance-time="handleAdvanceTime"
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
        />
      </template>
      <template #chat-area>
        <ChatArea
          :prefill-text="prefillCommand"
          :is-gm="isGm"
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
</style>
