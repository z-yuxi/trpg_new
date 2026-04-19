<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElDialog, ElMessage, ElSelect, ElOption } from 'element-plus';
import RoomLayout from '../layouts/RoomLayout.vue';
import LeftSidebar from '../components/room/LeftSidebar.vue';
import ChatArea from '../components/room/ChatArea.vue';
import AssistantDesk from '../components/room/AssistantDesk.vue';
import GMConsole from '../components/room/GMConsole.vue';
import TButton from '../components/base/TButton.vue';
import { useCampaignStore } from '../stores/campaign-store';
import { useAuthStore } from '../stores/auth-store';
import { useMessageStore } from '../stores/message-store';
import { socketClient } from '../socket/socket-client';
import type { StoryTime } from '@trpg/shared';

const route = useRoute();
const campaignStore = useCampaignStore();
const authStore = useAuthStore();
const messageStore = useMessageStore();

const campaignId = route.params.id as string;
const showGMConsole = ref(false);

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
const roomCharacters = ref<Array<{ id: string; name: string; avatarUrl: string; sceneId: string; online: boolean; userId?: string }>>([]);

const showCharacterDialog = ref(false);
const selectedCharacter = ref<any>(null);
const showForceMoveDialog = ref(false);
const selectedForceCharacterId = ref('');
const forceMoveTargetSceneId = ref('');

const unreadCounts = computed(() => messageStore.unreadCounts);
const currentScene = computed(() => scenes.value.find((scene) => scene.id === currentSceneId.value));

const activeSpatialCharacters = computed(() => {
  if (currentScene.value?.type !== 'spatial') return [];
  return roomCharacters.value.filter((char) => char.sceneId === currentSceneId.value);
});

const myVirtualSceneIds = computed(() => {
  const ids = new Set<string>();
  roomCharacters.value
    .filter((char) => char.userId === authStore.userId)
    .forEach((char) => {
      const scene = scenes.value.find((item) => item.id === char.sceneId);
      if (scene?.type === 'virtual') ids.add(scene.id);
    });
  return [...ids];
});

const moveTargetOptions = computed(() => scenes.value.filter((scene) => scene.type === 'spatial' || scene.type === 'lobby'));

const prefillCommand = ref('');

function handleFillCommand(cmd: string) {
  prefillCommand.value = cmd;
  // Reset after a tick so the watcher fires again if the same command is used twice
  setTimeout(() => { prefillCommand.value = ''; }, 50);
}

async function loadScenes() {
  const res = await fetch(`/api/campaigns/${campaignId}/scenes`, {
    headers: { Authorization: `Bearer ${authStore.token}` },
  });
  if (res.ok) scenes.value = await res.json();
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
    }));

    const myChar = data.find((item: any) => item.user_id === authStore.userId);
    if (myChar?.id) {
      characterId.value = myChar.id;
      if (!currentSceneId.value && myChar.scene_id) {
        switchScene(myChar.scene_id);
      }
    }
  } catch {
    ElMessage.error('角色列表加载失败');
  }
}

async function viewCharacter(characterIdToView: string) {
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
          const cmds = ruleset.commands ?? {};
          commands.value = Object.entries(cmds).map(([name, desc]: [string, any]) => ({
            name,
            description: typeof desc === 'string' ? desc : desc?.description ?? '',
          }));
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
  } catch {
    // ignore bootstrap errors
  }

  socketClient.connectRoom();
  socketClient.joinRoom(campaignId, characterId.value);
  if (currentSceneId.value) socketClient.subscribeScene(currentSceneId.value);

  socketClient.onTimeAdvanced((data) => {
    globalTime.value = data.new_time;
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
});

onUnmounted(() => {
  socketClient.leaveRoom();
  socketClient.disconnect();
});
</script>

<template>
  <div style="height:100vh;overflow:hidden">
    <div v-if="showGMConsole">
      <GMConsole
        :campaign-id="campaignId"
        :global-story-time="globalTime"
        :pending-moves="pendingMoves"
        :scenes="scenes"
        :npcs="npcs"
        :enable-connections="false"
      />
    </div>
    <RoomLayout
      :campaign-name="campaignStore.currentCampaign?.name ?? '加载中...'"
      :room-code="campaignStore.currentCampaign?.room_code"
      :is-gm="isGm"
      @toggle-gm-console="showGMConsole = !showGMConsole"
    >
      <template #gm-console>
        <transition name="gm-slide">
          <GMConsole
            v-if="isGm && showGMConsole"
            :campaign-id="campaignId"
            :global-story-time="globalTime"
            :scenes="scenes"
            :npcs="npcs"
            :characters="roomCharacters.map(c => ({ id: c.id, name: c.name }))"
            @scene-created="handleSceneCreated"
            @npc-created="(n) => npcs.push(n)"
            @play-as-npc="(id) => { /* TODO: set identity */ }"
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
        <ChatArea :prefill-text="prefillCommand" />
      </template>
      <template #right-desk>
        <AssistantDesk
          :campaign-id="campaignId"
          :commands="commands"
          :is-gm="isGm"
          @fill-command="handleFillCommand"
          @broadcast="() => {}"
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
