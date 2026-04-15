<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import SvgIcon from '../components/SvgIcon.vue';

const props = defineProps<{ campaignName?: string; roomCode?: string; isGm?: boolean }>();
const emit = defineEmits<{ 'toggle-gm-console': [] }>();

const leftVisible = ref(true);
const rightVisible = ref(true);
const isMobile = ref(false);

function updateMobile() { isMobile.value = window.innerWidth < 768; }

onMounted(() => {
  updateMobile();
  window.addEventListener('resize', updateMobile);
});

onUnmounted(() => window.removeEventListener('resize', updateMobile));

function copyCode() {
  if (props.roomCode) navigator.clipboard.writeText(props.roomCode);
}
</script>

<template>
  <div class="room-layout" :class="{ 'mobile': isMobile }">
    <!-- 顶部栏 -->
    <header class="room-topbar">
      <button class="icon-btn" @click="leftVisible = !leftVisible" aria-label="切换左侧栏">
        <SvgIcon name="icon-list" :size="18" />
      </button>
      <div class="room-info">
        <span class="room-name">{{ campaignName ?? '加载中...' }}</span>
        <code class="room-code" @click="copyCode" title="点击复制">{{ roomCode }}</code>
      </div>
      <div class="topbar-actions">
        <button v-if="isGm" class="icon-btn gm-btn" @click="emit('toggle-gm-console')">
          <SvgIcon name="icon-settings" :size="18" />
          <span>GM 控制台</span>
        </button>
        <button class="icon-btn" @click="rightVisible = !rightVisible" aria-label="切换助手台">
          <SvgIcon name="icon-scroll" :size="18" />
        </button>
      </div>
    </header>

    <!-- 主体区域 -->
    <div class="room-body">
      <!-- 左侧边栏 -->
      <aside class="room-sidebar left" :class="{ hidden: !leftVisible }">
        <slot name="left-sidebar" />
      </aside>

      <!-- 中央聊天区 -->
      <main class="room-main">
        <slot name="chat-area" />
      </main>

      <!-- 右侧助手台 -->
      <aside class="room-sidebar right" :class="{ hidden: !rightVisible }">
        <slot name="right-desk" />
      </aside>
    </div>

    <!-- 移动端底部快捷栏 -->
    <div v-if="isMobile" class="mobile-quick-bar">
      <button class="quick-btn"><SvgIcon name="icon-dice" :size="20" /><span>骰子</span></button>
      <button class="quick-btn"><SvgIcon name="icon-scroll" :size="20" /><span>角色卡</span></button>
      <button class="quick-btn"><SvgIcon name="icon-list" :size="20" /><span>命令</span></button>
      <button class="quick-btn"><SvgIcon name="icon-settings" :size="20" /><span>更多</span></button>
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
.icon-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border: none; background: none; cursor: pointer;
  color: var(--color-text-secondary); border-radius: var(--radius-md);
  font-size: var(--text-sm); transition: background var(--transition-fast);
}
.icon-btn:hover { background: var(--color-page-bg); color: var(--color-text-primary); }
.gm-btn { background: #fef3c7; color: #92400e; }

.room-body {
  flex: 1;
  display: flex;
  overflow: hidden;
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
  height: 56px;
  background: var(--color-card-bg);
  border-top: 1px solid var(--color-card-border);
}
.quick-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px; border: none; background: none; cursor: pointer;
  color: var(--color-text-secondary); font-size: var(--text-xs);
}
</style>
