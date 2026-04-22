<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import SvgIcon from '../components/SvgIcon.vue';
import { useTheme } from '../composables/useTheme';

type MobileAssistantTab = 'cmds' | 'map' | 'dice' | 'secret' | 'broadcast';
type MobileView = 'chat' | 'scenes' | 'assistant' | 'gm';

// 移动端半屏面板
type QuickPanel = 'none' | 'dice' | 'charcard' | 'commands' | 'more';
const activeQuickPanel = ref<QuickPanel>('none');

function openQuickPanel(p: QuickPanel) {
  activeQuickPanel.value = activeQuickPanel.value === p ? 'none' : p;
}
function closeQuickPanel() { activeQuickPanel.value = 'none'; }

const props = defineProps<{ campaignName?: string; roomCode?: string; isGm?: boolean; campaignId?: string; globalTime?: { day: number; hour: number; minute: number } | null; mobileView?: MobileView; pendingMovesCount?: number; npcs?: Array<{ id: string; name: string }>; quickDiceCommands?: Array<{ label: string; command: string }>; quickCommandList?: Array<{ name: string; description: string }>; charCardSummary?: { name: string; hp?: number; maxHp?: number; attrs?: Record<string, number> } | null }>();
const emit = defineEmits<{
  'toggle-gm-console': [];
  'export-log': [];
  'mobile-assistant-open': [tab: MobileAssistantTab];
  'update:mobileView': [view: MobileView];
  'announce-time': [];
  'play-as-npc': [npcId: string];
  'open-approve': [];
  'quick-dice': [command: string];
  'quick-command': [command: string];
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
  router.push('/campaigns');
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

    <!-- 移动端底部快捷栏（附录J：高频操作聚焦） -->
    <div v-if="isMobile" class="mobile-quick-bar">
      <button class="quick-btn" :class="{ active: activeQuickPanel === 'dice' }" @click="openQuickPanel('dice')">
        <span class="quick-icon">🎲</span><span>骰子</span>
      </button>
      <button class="quick-btn" :class="{ active: activeQuickPanel === 'charcard' }" @click="openQuickPanel('charcard')">
        <SvgIcon name="icon-char" :size="20" /><span>角色卡</span>
      </button>
      <button class="quick-btn" :class="{ active: activeQuickPanel === 'commands' }" @click="openQuickPanel('commands')">
        <SvgIcon name="icon-scroll" :size="20" /><span>指令</span>
      </button>
      <button class="quick-btn" :class="{ active: activeQuickPanel === 'more' }" @click="openQuickPanel('more')">
        <SvgIcon name="icon-more" :size="20" /><span>更多</span>
      </button>
    </div>

    <!-- 半屏骰子快捷面板 -->
    <teleport to="body">
      <div v-if="isMobile && activeQuickPanel !== 'none'" class="quick-panel-overlay" @click="closeQuickPanel" />

      <!-- 🎲 骰子面板 -->
      <div v-if="isMobile && activeQuickPanel === 'dice'" class="quick-panel">
        <div class="quick-panel-drag" @click="closeQuickPanel" />
        <h4 class="quick-panel-title">快捷骰子</h4>
        <div class="dice-shortcuts">
          <button
            v-for="d in (quickDiceCommands ?? [{ label: '侦查 d100', command: '.ra 侦查' }, { label: '骰 1d100', command: '.r 1d100' }, { label: '骰 1d6', command: '.r 1d6' }, { label: '骰 1d20', command: '.r 1d20' }])"
            :key="d.command"
            class="dice-shortcut-btn"
            @click="emit('quick-dice', d.command); closeQuickPanel()"
          >{{ d.label }}</button>
        </div>
      </div>

      <!-- 角色卡摘要面板 -->
      <div v-if="isMobile && activeQuickPanel === 'charcard'" class="quick-panel">
        <div class="quick-panel-drag" @click="closeQuickPanel" />
        <h4 class="quick-panel-title">角色卡</h4>
        <div v-if="charCardSummary" class="char-summary">
          <div class="char-summary-name">{{ charCardSummary.name }}</div>
          <div v-if="charCardSummary.hp != null" class="char-hp-row">
            <span>HP</span>
            <div class="char-hp-bar">
              <div class="char-hp-fill" :style="{ width: `${Math.round((charCardSummary.hp / (charCardSummary.maxHp || 1)) * 100)}%` }" />
            </div>
            <span class="char-hp-text">{{ charCardSummary.hp }}/{{ charCardSummary.maxHp }}</span>
          </div>
          <div class="char-attrs">
            <div v-for="(val, key) in charCardSummary.attrs" :key="key" class="char-attr-item">
              <span class="char-attr-key">{{ key }}</span>
              <span class="char-attr-val">{{ val }}</span>
            </div>
          </div>
        </div>
        <div v-else class="quick-panel-empty">请在助理台绑定角色卡</div>
        <button class="char-edit-btn" @click="openAssistantTab('dice'); closeQuickPanel()">查看完整角色卡</button>
      </div>

      <!-- 指令速查面板 -->
      <div v-if="isMobile && activeQuickPanel === 'commands'" class="quick-panel">
        <div class="quick-panel-drag" @click="closeQuickPanel" />
        <h4 class="quick-panel-title">指令速查</h4>
        <div class="cmd-list">
          <button
            v-for="cmd in (quickCommandList ?? [])"
            :key="cmd.name"
            class="cmd-list-item"
            @click="emit('quick-command', `.${cmd.name} `); closeQuickPanel()"
          >
            <span class="cmd-name">.{{ cmd.name }}</span>
            <span class="cmd-desc">{{ cmd.description }}</span>
          </button>
          <div v-if="!quickCommandList?.length" class="quick-panel-empty">暂无指令</div>
        </div>
      </div>

      <!-- 更多面板 -->
      <div v-if="isMobile && activeQuickPanel === 'more'" class="quick-panel">
        <div class="quick-panel-drag" @click="closeQuickPanel" />
        <h4 class="quick-panel-title">更多</h4>
        <div class="more-actions">
          <button class="more-action-btn" @click="emit('update:mobileView', 'scenes'); closeQuickPanel()">📍 场景列表</button>
          <button class="more-action-btn" @click="openAssistantTab('cmds'); closeQuickPanel()">🗂 助理台</button>
          <button class="more-action-btn" @click="openAssistantTab('dice'); closeQuickPanel()">🎲 投骰历史</button>
          <template v-if="isGm">
            <button class="more-action-btn gm-action" @click="emit('announce-time'); closeQuickPanel()">📢 宣布时间</button>
            <button class="more-action-btn gm-action" @click="emit('open-approve'); closeQuickPanel()">
              ✅ 审批<span v-if="pendingMovesCount" class="more-badge">{{ pendingMovesCount }}</span>
            </button>
            <button class="more-action-btn gm-action" @click="emit('update:mobileView', 'gm'); closeQuickPanel()">🎭 导演台</button>
          </template>
        </div>
      </div>
    </teleport>
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
.gm-btn { background: #fef3c7; color: #92400e; }
.director-btn {
  background: linear-gradient(135deg, var(--color-accent, #3b82f6), #6366f1);
  color: #fff;
  font-weight: 600;
  position: relative;
}
.director-btn:hover { filter: brightness(1.1); color: #fff; }
.director-badge {
  background: var(--color-error, #ef4444);
  color: #fff;
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
  background: var(--color-error, #ef4444); color: #fff;
  font-size: 10px; font-weight: 700; line-height: 16px;
  text-align: center; padding: 0 3px;
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
.quick-icon { font-size: 20px; line-height: 1; }

/* ===== 半屏面板 ===== */
.quick-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 198;
  background: rgba(0,0,0,.35);
}
.quick-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 199;
  background: var(--color-card-bg);
  border-radius: 16px 16px 0 0;
  padding: 0 16px 24px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  max-height: 55vh;
  overflow-y: auto;
  animation: slideUpPanel .22s cubic-bezier(.22,.61,.36,1) both;
}
@keyframes slideUpPanel {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.quick-panel-drag {
  width: 40px; height: 4px;
  background: var(--border-default);
  border-radius: 2px;
  margin: 10px auto 12px;
  cursor: pointer;
}
.quick-panel-title {
  font-size: var(--text-base);
  font-weight: 600;
  margin-bottom: 12px;
  color: var(--text-body);
}
.quick-panel-empty { font-size: var(--text-sm); color: var(--text-muted); padding: 8px 0; }

/* 骰子面板 */
.dice-shortcuts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dice-shortcut-btn {
  padding: 12px; border: 1px solid var(--border-default); border-radius: var(--radius-md);
  background: none; color: var(--text-body); font-size: var(--text-sm); cursor: pointer;
  text-align: center;
}
.dice-shortcut-btn:active { background: var(--color-hover-bg, rgba(255,255,255,.06)); }

/* 角色卡面板 */
.char-summary { padding: 8px 0; }
.char-summary-name { font-size: var(--text-lg); font-weight: 600; margin-bottom: 8px; color: var(--text-body); }
.char-hp-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: var(--text-sm); }
.char-hp-bar { flex: 1; height: 8px; background: var(--border-default); border-radius: 4px; overflow: hidden; }
.char-hp-fill { height: 100%; background: #22c55e; border-radius: 4px; transition: width .3s; }
.char-hp-text { color: var(--text-muted); font-size: var(--text-xs); }
.char-attrs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.char-attr-item { background: var(--color-page-bg); border-radius: var(--radius-sm); padding: 4px 8px; font-size: var(--text-xs); }
.char-attr-key { color: var(--text-muted); margin-right: 4px; }
.char-attr-val { font-weight: 600; color: var(--text-body); }
.char-edit-btn {
  width: 100%; padding: 10px; border: 1px solid var(--color-accent);
  border-radius: var(--radius-md); background: none; color: var(--color-accent);
  font-size: var(--text-sm); cursor: pointer;
}

/* 指令面板 */
.cmd-list { display: flex; flex-direction: column; gap: 2px; }
.cmd-list-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 8px; border: none; border-radius: var(--radius-sm);
  background: none; cursor: pointer; text-align: left; width: 100%;
}
.cmd-list-item:active { background: var(--color-hover-bg, rgba(255,255,255,.06)); }
.cmd-name { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-accent); min-width: 80px; }
.cmd-desc { font-size: var(--text-xs); color: var(--text-muted); }

/* 更多面板 */
.more-actions { display: flex; flex-direction: column; gap: 4px; }
.more-action-btn {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 10px; border: none; border-radius: var(--radius-md);
  background: none; color: var(--text-body); font-size: var(--text-base); cursor: pointer; width: 100%; text-align: left;
}
.more-action-btn:active { background: var(--color-hover-bg, rgba(255,255,255,.06)); }
.more-action-btn.gm-action { color: #92400e; }
.more-badge {
  margin-left: auto; background: var(--color-danger); color: #fff;
  font-size: 11px; padding: 1px 6px; border-radius: 8px;
}



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
