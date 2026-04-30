<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import GMConsole from '../components/room/GMConsole.vue';
import GmNowPanel from '../components/room/GmNowPanel.vue';
import SvgIcon from '../components/SvgIcon.vue';
import { useCampaignStore } from '../stores/campaign-store';
import { useTheme } from '../composables/useTheme';
import { api } from '../utils/api';
import type { StoryTime, Scene, CampaignNpc, Campaign } from '@trpg/shared';

type DirectorModule = 'now' | 'scenes' | 'npcs' | 'clues' | 'timeline' | 'settings';
// GMConsole tab mapping for modules that delegate to GMConsole
type GmConsoleTab = 'scenes' | 'npcs' | 'clue' | 'trajectory' | 'grid' | 'broadcast';

const route = useRoute();
const router = useRouter();
const campaignStore = useCampaignStore();
const { currentTheme, toggleTheme } = useTheme();

const campaignId = computed(() => route.params.campaignId as string);
const module = computed<DirectorModule>(() => {
  const m = route.params.module as string;
  // support legacy module names for backwards compat
  const legacyMap: Record<string, DirectorModule> = {
    clue: 'clues', clues: 'clues', timeline: 'timeline', map: 'timeline',
    scenes: 'scenes', npcs: 'npcs', settings: 'settings',
  };
  return (legacyMap[m] ?? m ?? 'now') as DirectorModule;
});

const loading = ref(false);
const scenes = ref<Scene[]>([]);
const npcs = ref<CampaignNpc[]>([]);
const characters = ref<{ id: string; name: string; sceneId?: string }[]>([]);
const globalStoryTime = ref<StoryTime>({ day: 1, hour: 8, minute: 0 });

const navItems: { key: DirectorModule; label: string; icon: string; badge?: boolean }[] = [
  { key: 'now', label: '此刻', icon: 'icon-clock', badge: true },
  { key: 'scenes', label: '场景', icon: 'icon-grid' },
  { key: 'npcs', label: '角色', icon: 'icon-npc' },
  { key: 'clues', label: '线索', icon: 'icon-scroll' },
  { key: 'timeline', label: '记录', icon: 'icon-history' },
  { key: 'settings', label: '设置', icon: 'icon-settings' },
];

// 把导演模式 module 映射到 GMConsole 的 tab 名
const moduleToConsoleTab: Partial<Record<DirectorModule, GmConsoleTab>> = {
  scenes: 'scenes',
  npcs: 'npcs',
  clues: 'clue',
  timeline: 'trajectory',
};

const activeConsoleTab = computed<GmConsoleTab>(() => moduleToConsoleTab[module.value] ?? 'scenes');
const pendingMovesCount = ref(0);

function switchModule(key: DirectorModule) {
  router.push(`/campaign/${campaignId.value}/gm/${key}`);
}

function goBack() {
  router.push(`/room/${campaignId.value}`);
}

async function loadData() {
  loading.value = true;
  try {
    const [campaign, scenesData, npcsData, charsData] = await Promise.all([
      api.get<Campaign>(`/campaigns/${campaignId.value}`),
      api.get<Scene[]>(`/campaigns/${campaignId.value}/scenes`),
      api.get<CampaignNpc[]>(`/campaigns/${campaignId.value}/npcs`),
      api.get<Record<string, unknown>[]>(`/campaigns/${campaignId.value}/characters`),
    ]);

    campaignStore.setCurrentCampaign(campaign);
    if (campaign.global_story_time) {
      try { globalStoryTime.value = typeof campaign.global_story_time === 'string' ? JSON.parse(campaign.global_story_time) : campaign.global_story_time; } catch { /* ignore */ }
    }
    scenes.value = scenesData;
    npcs.value = npcsData;
    characters.value = charsData.map((c) => ({
      id: c['id'] as string,
      name: c['name'] as string,
      sceneId: c['scene_id'] as string | undefined,
    }));
  } catch {
    ElMessage.error('数据加载失败');
  } finally {
    loading.value = false;
  }
}

function handleSceneCreated(scene: Scene) {
  scenes.value.push(scene);
}

function handleNpcCreated(npc: CampaignNpc) {
  npcs.value.push(npc);
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div class="director-mode">
    <!-- 顶部导航栏 -->
    <header class="director-header">
      <button class="return-btn" @click="goBack">
        <SvgIcon name="icon-back" :size="16" />
        返回叙事
      </button>
      <div class="director-title">
        导演台
        <span class="campaign-subtitle">· {{ campaignStore.currentCampaign?.name ?? '加载中...' }}</span>
      </div>
      <button class="theme-toggle-btn" @click="toggleTheme" :title="currentTheme === 'day' ? '切换夜间模式' : '切换日间模式'">
        <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="18" />
      </button>
    </header>

    <div class="director-body" v-loading="loading">
      <!-- 左侧情境导航 -->
      <nav class="director-nav">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: module === item.key }"
          @click="switchModule(item.key)"
        >
          <SvgIcon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
          <span v-if="item.badge && pendingMovesCount > 0" class="nav-badge">{{ pendingMovesCount }}</span>
        </button>
      </nav>

      <!-- 主内容区 -->
      <main class="director-content">
        <!-- 此刻：仪表盘面板 -->
        <GmNowPanel
          v-if="module === 'now'"
          :campaign-id="campaignId"
          :global-story-time="globalStoryTime"
          :characters="characters"
          @pending-count="(n) => pendingMovesCount = n"
        />

        <!-- 设置 -->
        <div v-else-if="module === 'settings'" class="settings-placeholder">
          <h2>团设置</h2>
          <p class="placeholder-tip">高级功能开关、OB 权限、房间码等设置（规划中）</p>
        </div>

        <!-- 场景/角色/线索/记录：复用 GMConsole -->
        <GMConsole
          v-else-if="!loading && campaignStore.currentCampaign"
          :campaign-id="campaignId"
          :global-story-time="globalStoryTime"
          :scenes="scenes"
          :npcs="npcs"
          :characters="characters"
          :standalone="true"
          :default-tab="activeConsoleTab"
          @scene-created="handleSceneCreated"
          @npc-created="handleNpcCreated"
          @play-as-npc="() => {}"
        />
        <div v-else-if="!loading" class="director-empty">请先进入房间再访问导演台</div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.director-mode {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--color-page-bg);
  overflow: hidden;
}

.director-header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-6, 24px);
  height: var(--navbar-height, 56px);
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-card-border);
  flex-shrink: 0;
}

.return-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 14px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}
.return-btn:hover {
  background: var(--color-accent, #3b82f6);
  color: #fff;
  border-color: var(--color-accent, #3b82f6);
}

.theme-toggle-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px; height: 36px;
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}
.theme-toggle-btn:hover {
  background: var(--color-page-bg);
  color: var(--color-text-primary);
}

.director-title {
  font-size: var(--text-lg, 16px);
  font-weight: 700;
}
.campaign-subtitle {
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--color-text-muted);
}

.director-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* ── 左侧情境导航 ── */
.director-nav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  padding: var(--space-4, 16px) 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 11px var(--space-4, 16px);
  border: none;
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-align: left;
  transition: background var(--transition-fast), color var(--transition-fast);
  border-left: 3px solid transparent;
  position: relative;
}
.nav-item:hover {
  background: var(--color-page-bg);
  color: var(--color-text-primary);
}
.nav-item.active {
  color: var(--color-accent, #2563eb);
  background: color-mix(in srgb, var(--color-accent, #2563eb) 10%, var(--color-page-bg));
  border-left-color: var(--color-accent, #2563eb);
  font-weight: 600;
}
.nav-badge {
  margin-left: auto;
  padding: 2px 8px;
  background: var(--color-error, #ef4444);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  border-radius: 10px;
  line-height: 1.4;
}

/* ── 主内容区 ── */
.director-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-placeholder,
.director-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-3);
  color: var(--color-text-muted);
}
.settings-placeholder h2 {
  font-size: var(--text-xl, 20px);
  font-weight: 600;
  color: var(--color-text-primary);
}
.placeholder-tip { font-size: var(--text-sm); }

/* ── 移动端：顶部横向 Tab ── */
@media (max-width: 768px) {
  .director-body { flex-direction: column; }

  .director-nav {
    width: 100%;
    flex-direction: row;
    border-right: none;
    border-bottom: 1px solid var(--color-card-border);
    padding: 0 var(--space-2);
    overflow-x: auto;
    overflow-y: hidden;
    flex-wrap: nowrap;
    height: 48px;
    align-items: stretch;
  }

  .nav-item {
    flex-shrink: 0;
    padding: 0 var(--space-3);
    border-left: none;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
    align-items: center;
    justify-content: center;
  }

  .nav-item.active {
    border-left-color: transparent;
    border-bottom-color: var(--color-accent, #2563eb);
  }
}
</style>
