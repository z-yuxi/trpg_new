<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';
import { useTheme } from '../composables/useTheme';

type MobileAssistantTab = 'cmds' | 'map' | 'dice' | 'secret' | 'broadcast';
type MobileView = 'chat' | 'scenes' | 'assistant' | 'gm';

const props = defineProps<{ campaignName?: string; roomCode?: string; isGm?: boolean; campaignId?: string; globalTime?: { day: number; hour: number; minute: number } | null; mobileView?: MobileView; pendingMovesCount?: number; npcs?: Array<{ id: string; name: string }> }>();
const emit = defineEmits<{
  'toggle-gm-console': [];
  'export-log': [];
  'mobile-assistant-open': [tab: MobileAssistantTab];
  'update:mobileView': [view: MobileView];
  'announce-time': [];
  'play-as-npc': [npcId: string];
  'open-approve': [];
}>();
const router = useRouter();
const { currentTheme, toggleTheme } = useTheme();

const leftVisible = ref(true);
const rightVisible = ref(true);
const isMobile = ref(false);
const currentMobileView = computed<MobileView>(() => props.mobileView ?? 'chat');

function updateMobile() { isMobile.value = window.innerWidth < 768; }

onMounted(() => {
  updateMobile();
  window.addEventListener('resize', updateMobile);
});

onUnmounted(() => window.removeEventListener('resize', updateMobile));

function copyCode() {
  if (props.roomCode) navigator.clipboard.writeText(props.roomCode);
}

function toggleLeftPanel() {
  if (isMobile.value) {
    emit('update:mobileView', 'scenes');
    return;
  }
  leftVisible.value = !leftVisible.value;
}

function toggleRightPanel() {
  if (isMobile.value) {
    emit('update:mobileView', 'assistant');
    return;
  }
  rightVisible.value = !rightVisible.value;
}

function openAssistantTab(tab: MobileAssistantTab) {
  emit('mobile-assistant-open', tab);
  emit('update:mobileView', 'assistant');
}

function handleQuickMore() {
  if (props.isGm) {
    emit('update:mobileView', 'gm');
    return;
  }
  emit('update:mobileView', 'scenes');
}

function handleBackToCampaigns() {
  const confirmed = window.confirm('确定离开房间？未保存的内容不会丢失，你可以随时回来。');
  if (!confirmed) return;
  router.push('/rooms');
}

const showNpcMenu = ref(false);

function toggleNpcMenu() { showNpcMenu.value = !showNpcMenu.value; }

function openGmPage(module: string) {
  if (props.campaignId) router.push(`/campaign/${props.campaignId}/gm/${module}`);
}

function playAsNpc(npcId: string) {
  showNpcMenu.value = false;
  emit('play-as-npc', npcId);
}
</script>

<template>
  <div class="room-layout" :class="{ mobile: isMobile }">
    <!-- 顶部栏 -->
    <header class="room-topbar">
      <button class="icon-btn back-btn" @click="handleBackToCampaigns" aria-label="离开房间">
        <SvgIcon name="icon-back" :size="18" />
      </button>
      <button class="icon-btn" @click="toggleLeftPanel" aria-label="切换左侧栏">
        <SvgIcon name="icon-list" :size="18" />
      </button>
      <div class="room-info">
        <span class="room-name">{{ campaignName ?? '加载中...' }}</span>
        <code class="room-code" @click="copyCode" title="点击复制">{{ roomCode }}</code>
      </div>
      <div class="topbar-actions">
        <!-- GM 快捷操作（仅 GM 可见） -->
        <template v-if="isGm">
          <button class="icon-btn quick-time desktop-action" @click="emit('announce-time')" title="宣布剧情时间">宣布时间</button>
          <button class="icon-btn approve-btn desktop-action" @click="emit('open-approve')">
            审批
            <span v-if="pendingMovesCount" class="badge">{{ pendingMovesCount }}</span>
          </button>
          <!-- NPC 扮演下拉 -->
          <div class="dropdown-wrap" v-if="npcs?.length">
            <button class="icon-btn desktop-action" @click="toggleNpcMenu">
              NPC
              <SvgIcon name="icon-caret-down" :size="12" />
            </button>
            <ul v-if="showNpcMenu" class="dropdown-menu">
              <li v-for="npc in npcs" :key="npc.id" @click="playAsNpc(npc.id)">{{ npc.name }}</li>
            </ul>
          </div>
          <!-- 导演台按钮（取代旧 GM 下拉菜单） -->
          <button class="icon-btn director-btn desktop-action" @click="openGmPage('now')" title="进入导演台">
            <SvgIcon name="icon-settings" :size="16" />
            导演台
            <span v-if="pendingMovesCount" class="director-badge">{{ pendingMovesCount }}</span>
          </button>
          <!-- 移动端仅显示：宣布时间 和 审批 -->
          <button class="icon-btn quick-time mobile-action" @click="emit('announce-time')">时间</button>
          <button class="icon-btn approve-btn mobile-action" @click="emit('open-approve')">
            审批
            <span v-if="pendingMovesCount" class="badge">{{ pendingMovesCount }}</span>
          </button>
          <button class="icon-btn mobile-action" @click="handleQuickMore">
            <SvgIcon name="icon-settings" :size="18" />
          </button>
        </template>
        <button v-if="isGm" class="icon-btn export-btn desktop-action" @click="emit('export-log')" aria-label="导出日志">
          <SvgIcon name="icon-scroll" :size="18" />
          <span>导出日志</span>
        </button>
        <button class="icon-btn" @click="toggleRightPanel" aria-label="切换助手台">
          <SvgIcon name="icon-scroll" :size="18" />
        </button>
        <button class="icon-btn theme-toggle-btn" @click="toggleTheme" :title="currentTheme === 'day' ? '切换夜间模式' : '切换日间模式'">
          <SvgIcon :name="currentTheme === 'day' ? 'icon-moon' : 'icon-sun'" :size="18" />
        </button>
      </div>
    </header>

    <!-- GM 控制台面板（下拉，推挤聊天区，仅GM可见） -->
    <div v-if="!isMobile" class="gm-console-wrap">
      <slot name="gm-console" />
    </div>

    <!-- 主体区域 -->
    <div class="room-body">
      <!-- 左侧边栏 -->
      <aside v-if="!isMobile" class="room-sidebar left" :class="{ hidden: !leftVisible }">
        <slot name="left-sidebar" />
      </aside>

      <main class="room-main">
        <slot v-if="!isMobile || currentMobileView === 'chat'" name="chat-area" />
        <slot v-else-if="currentMobileView === 'scenes'" name="left-sidebar" />
        <slot v-else-if="currentMobileView === 'assistant'" name="right-desk" />
        <slot v-else-if="currentMobileView === 'gm' && isGm" name="gm-console" />
      </main>

      <!-- 右侧助手台 -->
      <aside v-if="!isMobile" class="room-sidebar right" :class="{ hidden: !rightVisible }">
        <slot name="right-desk" />
      </aside>
    </div>

    <!-- 移动端底部快捷栏 -->
    <div v-if="isMobile" class="mobile-quick-bar">
      <button class="quick-btn" :class="{ active: currentMobileView === 'chat' }" @click="emit('update:mobileView', 'chat')"><SvgIcon name="icon-send" :size="20" /><span>聊天</span></button>
      <button class="quick-btn" :class="{ active: currentMobileView === 'scenes' }" @click="emit('update:mobileView', 'scenes')"><SvgIcon name="icon-list" :size="20" /><span>场景</span></button>
      <button class="quick-btn" :class="{ active: currentMobileView === 'assistant' }" @click="openAssistantTab('cmds')"><SvgIcon name="icon-scroll" :size="20" /><span>助理台</span></button>
      <button v-if="isGm" class="quick-btn" :class="{ active: currentMobileView === 'gm' }" @click="handleQuickMore"><SvgIcon name="icon-settings" :size="20" /><span>GM</span></button>
    </div>
  </div>
</template>

<style scoped>
.room-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--color-page-bg);
}
.room-topbar {
  height: var(--navbar-height);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  background: var(--color-card-bg);
  border-bottom: 1px solid var(--color-card-border);
  flex-shrink: 0;
}
.room-info { flex: 1; display: flex; align-items: center; gap: var(--space-3); }
.room-name { font-weight: 600; font-size: var(--text-base); }
.room-code { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); cursor: pointer; letter-spacing: 2px; }
.room-code:hover { color: var(--color-accent); }
.topbar-actions { display: flex; align-items: center; gap: var(--space-2); }
.desktop-action { display: flex; }
.mobile-action { display: none; }
.icon-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border: none; background: none; cursor: pointer;
  color: var(--color-text-secondary); border-radius: var(--radius-md);
  font-size: var(--text-sm); transition: background var(--transition-fast);
}
.icon-btn:hover { background: var(--color-page-bg); color: var(--color-text-primary); }
.gm-btn { background: var(--color-warning-bg); color: var(--color-warning-text); }
.director-btn {
  background: linear-gradient(135deg, var(--color-primary), var(--indigo-500));
  color: var(--text-inverse);
  font-weight: 600;
  position: relative;
}
.director-btn:hover { filter: brightness(1.1); color: var(--text-inverse); }
.director-badge {
  background: var(--color-danger);
  color: var(--text-inverse);
  font-size: 10px; font-weight: 700;
  min-width: 16px; height: 16px; border-radius: 8px;
  line-height: 16px; text-align: center; padding: 0 3px;
}
.export-btn { background: var(--surface-hover); color: var(--color-text-secondary); }
.quick-time { font-weight: 600; font-family: var(--font-mono); }
.approve-btn { position: relative; }
.badge {
  position: absolute; top: 2px; right: 2px;
  min-width: 16px; height: 16px; border-radius: 8px;
  background: var(--color-danger);
  color: var(--text-inverse);
  font-size: 10px; font-weight: 700;
  line-height: 16px; text-align: center; padding: 0 3px;
}
.dropdown-wrap { position: relative; }
.dropdown-menu {
  position: absolute; top: calc(100% + 6px); right: 0;
  min-width: 130px; background: var(--color-card-bg);
  border: 1px solid var(--color-card-border); border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0,0,0,.15); z-index: 200;
  padding: 4px 0; list-style: none; margin: 0;
}
.dropdown-menu li {
  padding: 8px 16px; font-size: var(--text-sm); cursor: pointer;
  color: var(--color-text-secondary);
}
.dropdown-menu li:hover { background: var(--color-page-bg); color: var(--color-text-primary); }
.back-btn { margin-right: 2px; }

.room-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}
.room-sidebar {
  flex-shrink: 0;
  overflow-y: auto;
  transition: width var(--transition-normal), opacity var(--transition-normal);
  border-right: 1px solid var(--color-card-border);
}
.room-sidebar.left { width: 240px; }
.room-sidebar.right { width: 320px; border-right: none; border-left: 1px solid var(--color-card-border); }
.room-sidebar.hidden { width: 0; opacity: 0; overflow: hidden; }
.room-main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* 移动端 */
.mobile .room-sidebar { display: none; }
.mobile-quick-bar {
  display: flex;
  height: var(--bottom-nav-height);
  background: var(--color-card-bg);
  border-top: 1px solid var(--color-card-border);
  position: sticky;
  bottom: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  z-index: 170;
}
.quick-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; border: none; background: none; cursor: pointer;
  color: var(--color-text-secondary); font-size: var(--text-xs);
}
.quick-btn:hover,
.quick-btn.active { color: var(--color-accent); }
.gm-console-wrap { flex-shrink: 0; overflow: hidden; }

@media (max-width: 768px) {
  .room-topbar {
    gap: var(--space-2);
    padding: 0 var(--space-2);
  }

  .room-info {
    min-width: 0;
    gap: var(--space-2);
  }

  .room-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .room-code {
    display: none;
  }

  .topbar-actions {
    gap: 0;
  }

  .desktop-action {
    display: none;
  }

  .mobile-action {
    display: flex;
  }

  .icon-btn {
    padding: 8px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }

  .gm-console-wrap {
    max-height: 56vh;
    overflow-y: auto;
  }

  .room-main {
    background: var(--color-card-bg);
  }
}
</style>
