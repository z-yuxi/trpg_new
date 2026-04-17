<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import RoomLayout from '../layouts/RoomLayout.vue';
import LeftSidebar from '../components/room/LeftSidebar.vue';
import ChatArea from '../components/room/ChatArea.vue';
import AssistantDesk from '../components/room/AssistantDesk.vue';
import GMConsole from '../components/room/GMConsole.vue';
import { useCampaignStore } from '../stores/campaign-store';
import { useAuthStore } from '../stores/auth-store';
import { socketClient } from '../socket/socket-client';
import type { StoryTime } from '@trpg/shared';

const route = useRoute();
const campaignStore = useCampaignStore();
const authStore = useAuthStore();

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

onMounted(async () => {
  socketClient.setToken(authStore.token);

  try {
    // 加载战役基础信息
    const campaignRes = await fetch(`/api/campaigns/${campaignId}`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (campaignRes.ok) {
      const campaign = await campaignRes.json();
      campaignStore.setCurrentCampaign(campaign);
      isGm.value = campaign.gm_user_id === authStore.userId;

      if (campaign.global_story_time) {
        try { globalTime.value = JSON.parse(campaign.global_story_time); } catch {}
      }

      // 加载规则集指令
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

    // 加载场景
    const scenesRes = await fetch(`/api/campaigns/${campaignId}/scenes`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (scenesRes.ok) scenes.value = await scenesRes.json();

    // 加载 NPC
    const npcsRes = await fetch(`/api/campaigns/${campaignId}/npcs`, {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (npcsRes.ok) npcs.value = await npcsRes.json();

    // 获取当前用户的角色卡（取第一个绑定到本团的角色）
    const charsRes = await fetch('/api/characters', {
      headers: { Authorization: `Bearer ${authStore.token}` },
    });
    if (charsRes.ok) {
      const chars = await charsRes.json();
      characterId.value = chars[0]?.id ?? '';
    }
  } catch { /* 静默失败 */ }

  // 连接 Socket
  socketClient.connectRoom();
  socketClient.joinRoom(campaignId, characterId.value);

  socketClient.onTimeAdvanced((data) => {
    globalTime.value = data.new_time;
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
      <template #left-sidebar>
        <LeftSidebar
          :scenes="scenes"
          :current-scene-id="''"
          :characters="[]"
          :connections="connections"
          :enable-connections="false"
          @scene-select="() => {}"
        />
      </template>
      <template #chat-area>
        <ChatArea />
      </template>
      <template #right-desk>
        <AssistantDesk
          :commands="commands"
          :dice-history="diceHistory"
          :is-gm="isGm"
          @fill-command="() => {}"
          @broadcast="() => {}"
        />
      </template>
    </RoomLayout>
  </div>
</template>
