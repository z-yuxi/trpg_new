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

// Mock 数据（实际由 API 填充）
const mockScenes = ref<any[]>([]);
const mockCharacters = ref<any[]>([]);
const mockConnections = ref<any[]>([]);
const mockPendingMoves = ref<any[]>([]);
const mockNpcs = ref<any[]>([]);
const mockCommands = ref([
  { name: 'roll', description: '投掷骰子，如 /roll 1d20' },
  { name: 'check', description: '技能检定，如 /check skill=侦查' },
  { name: 'initiative', description: '先攻掷骰' },
]);
const mockDiceHistory = ref<any[]>([]);
const mockIsGm = ref(false);
const mockGlobalTime = ref<StoryTime>({ day: 1, hour: 8, minute: 0 });

onMounted(async () => {
  socketClient.setToken(authStore.token);
  socketClient.connectRoom();
  socketClient.joinRoom(campaignId, '');

  socketClient.onTimeAdvanced((data) => {
    mockGlobalTime.value = data.new_time;
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
        :global-story-time="mockGlobalTime"
        :pending-moves="mockPendingMoves"
        :scenes="mockScenes"
        :npcs="mockNpcs"
        :enable-connections="false"
      />
    </div>
    <RoomLayout
      :campaign-name="campaignStore.currentCampaign?.name ?? '加载中...'"
      :room-code="campaignStore.currentCampaign?.room_code"
      :is-gm="mockIsGm"
      @toggle-gm-console="showGMConsole = !showGMConsole"
    >
      <template #left-sidebar>
        <LeftSidebar
          :scenes="mockScenes"
          :current-scene-id="''"
          :characters="mockCharacters"
          :connections="mockConnections"
          :enable-connections="false"
          @scene-select="() => {}"
        />
      </template>
      <template #chat-area>
        <ChatArea />
      </template>
      <template #right-desk>
        <AssistantDesk
          :commands="mockCommands"
          :dice-history="mockDiceHistory"
          :is-gm="mockIsGm"
          @fill-command="() => {}"
          @broadcast="() => {}"
        />
      </template>
    </RoomLayout>
  </div>
</template>
