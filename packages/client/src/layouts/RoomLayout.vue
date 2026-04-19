<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';

type MobileAssistantTab = 'cmds' | 'map' | 'dice' | 'secret' | 'broadcast';

const props = defineProps<{ campaignName?: string; roomCode?: string; isGm?: boolean; campaignId?: string }>();
const emit = defineEmits<{
  'toggle-gm-console': [];
  'export-log': [];
  'mobile-assistant-open': [tab: MobileAssistantTab];
}>();
const router = useRouter();

const leftVisible = ref(true);
const rightVisible = ref(true);
const isMobile = ref(false);
const mobilePanel = ref<'left' | 'right' | null>(null);

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
    mobilePanel.value = mobilePanel.value === 'left' ? null : 'left';
    return;
  }
  leftVisible.value = !leftVisible.value;
}

function toggleRightPanel() {
  if (isMobile.value) {
    mobilePanel.value = mobilePanel.value === 'right' ? null : 'right';
    return;
  }
  rightVisible.value = !rightVisible.value;
}

function openAssistantTab(tab: MobileAssistantTab) {
  emit('mobile-assistant-open', tab);
  mobilePanel.value = 'right';
}

function handleQuickMore() {
  if (props.isGm) {
    emit('toggle-gm-console');
    return;
  }
  mobilePanel.value = 'left';
}

function handleBackToCampaigns() {
  const confirmed = window.confirm('确定离开房间？未保存的内容不会丢失，你可以随时回来。');
  if (!confirmed) return;
  router.push('/campaigns');
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
        <button v-if="isGm" class="icon-btn gm-btn desktop-action" @click="emit('toggle-gm-console')">
          <SvgIcon name="icon-settings" :size="18" />
          <span>GM 控制台</span>
        </button>
        <button v-if="isGm" class="icon-btn export-btn desktop-action" @click="emit('export-log')" aria-label="导出日志">
          <SvgIcon name="icon-scroll" :size="18" />
          <span>导出日志</span>
        </button>
        <button class="icon-btn" @click="toggleRightPanel" aria-label="切换助手台">
          <SvgIcon name="icon-scroll" :size="18" />
        </button>
      </div>
    </header>

    <!-- GM 控制台面板（下拉，推挤聊天区，仅GM可见） -->
    <div class="gm-console-wrap">
      <slot name="gm-console" />
    </div>

    <!-- 主体区域 -->
    <div class="room-body">
      <!-- 左侧边栏 -->
      <aside v-if="!isMobile" class="room-sidebar left" :class="{ hidden: !leftVisible }">
        <slot name="left-sidebar" />
      </aside>

      <!-- 中央聊天区 -->
      <main class="room-main">
        <slot name="chat-area" />
      </main>

      <!-- 右侧助手台 -->
      <aside v-if="!isMobile" class="room-sidebar right" :class="{ hidden: !rightVisible }">
        <slot name="right-desk" />
      </aside>
    </div>

    <div v-if="isMobile && mobilePanel" class="mobile-overlay" @click="mobilePanel = null" />

    <aside v-if="isMobile" class="mobile-drawer left-drawer" :class="{ open: mobilePanel === 'left' }">
      <slot name="left-sidebar" />
    </aside>

    <aside v-if="isMobile" class="mobile-drawer right-drawer" :class="{ open: mobilePanel === 'right' }">
      <slot name="right-desk" />
    </aside>

    <!-- 移动端底部快捷栏 -->
    <div v-if="isMobile" class="mobile-quick-bar">
      <button class="quick-btn" @click="openAssistantTab('dice')"><SvgIcon name="icon-dice" :size="20" /><span>骰子</span></button>
      <button class="quick-btn" @click="openAssistantTab('cmds')"><SvgIcon name="icon-scroll" :size="20" /><span>角色卡</span></button>
      <button class="quick-btn" @click="openAssistantTab('cmds')"><SvgIcon name="icon-list" :size="20" /><span>命令</span></button>
      <button class="quick-btn" @click="handleQuickMore"><SvgIcon name="icon-settings" :size="20" /><span>更多</span></button>
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
.icon-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border: none; background: none; cursor: pointer;
  color: var(--color-text-secondary); border-radius: var(--radius-md);
  font-size: var(--text-sm); transition: background var(--transition-fast);
}
.icon-btn:hover { background: var(--color-page-bg); color: var(--color-text-primary); }
.gm-btn { background: #fef3c7; color: #92400e; }
.export-btn { background: var(--surface-hover); color: var(--color-text-secondary); }
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
.mobile-overlay {
  position: fixed;
  inset: var(--navbar-height) 0 calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px)) 0;
  background: rgba(15, 23, 42, 0.42);
  z-index: 180;
}
.mobile-drawer {
  position: fixed;
  top: var(--navbar-height);
  bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px));
  width: var(--mobile-drawer-width);
  max-width: 100%;
  background: var(--color-card-bg);
  z-index: 190;
  box-shadow: var(--shadow-xl);
  transition: transform var(--transition-normal);
  overflow: hidden;
}
.mobile-drawer.left-drawer {
  left: 0;
  transform: translateX(-100%);
}
.mobile-drawer.right-drawer {
  right: 0;
  transform: translateX(100%);
}
.mobile-drawer.open {
  transform: translateX(0);
}

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
.quick-btn:hover { color: var(--color-accent); }
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

  .icon-btn {
    padding: 8px;
    min-width: 40px;
    justify-content: center;
  }

  .gm-console-wrap {
    max-height: 56vh;
    overflow-y: auto;
  }
}
</style>
