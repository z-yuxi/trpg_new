<script setup lang="ts">
import { computed, ref } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import type { Scene, StoryTime } from '@trpg/shared';

const props = defineProps<{
  scenes: Scene[];
  currentSceneId: string;
  characters: { id: string; name: string; avatarUrl: string; sceneId: string; online: boolean }[];
  connections: { from: string; to: string; walkDuration: number }[];
  enableConnections: boolean;
  unreadCounts?: Record<string, number>;
  isGm?: boolean;
  myVirtualSceneIds?: string[];
  globalTime?: StoryTime;
  positionHistory?: { sceneId: string; storyTime?: StoryTime; messageId?: string }[];
}>();

const emit = defineEmits<{
  'scene-select': [sceneId: string];
  'gm-view-character': [characterId: string];
  'gm-force-move': [characterId: string];
  'jump-to-message': [messageId: string];
}>();

const groupOpen = ref({
  spatial: true,
  virtual: true,
  lobby: true,
});

const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  characterId: '',
});

const spatialScenes = computed(() => props.scenes.filter((scene) => scene.type === 'spatial'));

const currentScene = computed(() => props.scenes.find((s) => s.id === props.currentSceneId));

function formatStoryTime(t?: StoryTime) {
  if (!t) return '';
  const h = String(t.hour ?? 0).padStart(2, '0');
  const m = String(t.minute ?? 0).padStart(2, '0');
  return `第${t.day ?? 1}日 ${h}:${m}`;
}

const recentPath = computed(() => {
  const history = props.positionHistory ?? [];
  const last3 = history.slice(-3);
  return last3.map((entry) => ({
    sceneId: entry.sceneId,
    sceneName: props.scenes.find((s) => s.id === entry.sceneId)?.name ?? entry.sceneId,
    timeLabel: formatStoryTime(entry.storyTime),
    messageId: entry.messageId,
    isCurrent: entry.sceneId === props.currentSceneId,
  }));
});
const virtualScenes = computed(() => {
  const allowed = new Set(props.myVirtualSceneIds ?? []);
  return props.scenes.filter((scene) => scene.type === 'virtual' && (allowed.has(scene.id) || scene.id === props.currentSceneId));
});
const lobbyScenes = computed(() => props.scenes.filter((scene) => scene.type === 'lobby'));

function getSceneName(sceneId: string) {
  return props.scenes.find((s) => s.id === sceneId)?.name ?? sceneId;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;
}

function sceneUnread(sceneId: string) {
  return props.unreadCounts?.[sceneId] ?? 0;
}

function openCharacterMenu(event: MouseEvent, characterId: string) {
  if (!props.isGm) return;
  event.preventDefault();
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    characterId,
  };
}

function closeCharacterMenu() {
  contextMenu.value.visible = false;
}

function handleViewCharacter() {
  if (!contextMenu.value.characterId) return;
  emit('gm-view-character', contextMenu.value.characterId);
  closeCharacterMenu();
}

function handleForceMove() {
  if (!contextMenu.value.characterId) return;
  emit('gm-force-move', contextMenu.value.characterId);
  closeCharacterMenu();
}
</script>

<template>
  <div class="left-sidebar" @click="closeCharacterMenu">
    <!-- 当前场景卡片 -->
    <div v-if="currentScene" class="current-scene-card">
      <div class="cscard-header">
        <span class="cscard-dot">●</span>
        <span class="cscard-title">{{ currentScene.name }}</span>
        <span v-if="globalTime" class="cscard-time">{{ formatStoryTime(globalTime) }}</span>
      </div>
      <div v-if="currentScene.description" class="cscard-desc">{{ currentScene.description }}</div>
    </div>

    <!-- 路线图 -->
    <div v-if="recentPath.length > 1" class="route-map">
      <div class="route-nodes">
        <template v-for="(node, i) in recentPath" :key="node.sceneId + i">
          <div
            class="route-node"
            :class="{ current: node.isCurrent }"
            @click="node.messageId ? emit('jump-to-message', node.messageId) : undefined"
          >
            <div class="route-node-time">{{ node.timeLabel }}</div>
            <div class="route-node-name">{{ node.sceneName }}{{ node.isCurrent ? ' ← 当前' : '' }}</div>
          </div>
          <div v-if="i < recentPath.length - 1" class="route-arrow">→</div>
        </template>
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        <SvgIcon name="icon-grid" :size="14" />
        <span>场景</span>
      </div>

      <div class="scene-group">
        <button class="group-header" @click.stop="groupOpen.spatial = !groupOpen.spatial">
          <span class="arrow" :class="{ open: groupOpen.spatial }">▾</span>
          <span>剧情场</span>
        </button>
        <div v-if="groupOpen.spatial">
          <div
            v-for="scene in spatialScenes"
            :key="scene.id"
            class="scene-item"
            :class="{ active: scene.id === currentSceneId }"
            @click="emit('scene-select', scene.id)"
          >
            <span class="scene-dot">●</span>
            <span class="scene-name">{{ scene.name }}</span>
            <span v-if="sceneUnread(scene.id) > 0" class="badge">{{ sceneUnread(scene.id) }}</span>
          </div>
          <div v-if="spatialScenes.length === 0" class="empty-hint">暂无剧情场</div>
        </div>
      </div>

      <div class="scene-group">
        <button class="group-header" @click.stop="groupOpen.virtual = !groupOpen.virtual">
          <span class="arrow" :class="{ open: groupOpen.virtual }">▾</span>
          <span>私密场</span>
        </button>
        <div v-if="groupOpen.virtual">
          <div
            v-for="scene in virtualScenes"
            :key="scene.id"
            class="scene-item"
            :class="{ active: scene.id === currentSceneId }"
            @click="emit('scene-select', scene.id)"
          >
            <SvgIcon name="icon-lock" :size="14" />
            <span class="scene-name">{{ scene.name }}</span>
            <span v-if="sceneUnread(scene.id) > 0" class="badge">{{ sceneUnread(scene.id) }}</span>
          </div>
          <div v-if="virtualScenes.length === 0" class="empty-hint">暂无可见私密场</div>
        </div>
      </div>

      <div class="scene-group">
        <button class="group-header" @click.stop="groupOpen.lobby = !groupOpen.lobby">
          <span class="arrow" :class="{ open: groupOpen.lobby }">▾</span>
          <span>公共场</span>
        </button>
        <div v-if="groupOpen.lobby">
          <div
            v-for="scene in lobbyScenes"
            :key="scene.id"
            class="scene-item"
            :class="{ active: scene.id === currentSceneId }"
            @click="emit('scene-select', scene.id)"
          >
            <SvgIcon name="icon-broadcast" :size="14" />
            <span class="scene-name">{{ scene.name }}</span>
            <span v-if="sceneUnread(scene.id) > 0" class="badge">{{ sceneUnread(scene.id) }}</span>
          </div>
          <div v-if="lobbyScenes.length === 0" class="empty-hint">暂无公共场</div>
        </div>
      </div>
    </div>

    <div v-if="enableConnections && connections.length" class="section">
      <div class="section-title">
        <SvgIcon name="icon-history" :size="14" />
        <span>路线</span>
      </div>
      <div v-for="(conn, i) in connections" :key="i" class="conn-item">
        <span>{{ getSceneName(conn.from) }}</span>
        <span class="arrow-link">→</span>
        <span>{{ getSceneName(conn.to) }}</span>
        <span class="duration">步行 {{ formatDuration(conn.walkDuration) }}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        <SvgIcon name="icon-npc" :size="14" />
        <span>在场角色</span>
      </div>
      <div
        v-for="char in characters"
        :key="char.id"
        class="char-item"
        @contextmenu="openCharacterMenu($event, char.id)"
      >
        <div class="char-avatar">
          <img v-if="char.avatarUrl" :src="char.avatarUrl" />
          <span v-else>{{ char.name[0] }}</span>
          <span class="online-dot" :class="{ online: char.online }" />
        </div>
        <div class="char-info">
          <div class="char-name">{{ char.name }}</div>
          <div class="char-scene">{{ getSceneName(char.sceneId) }}</div>
        </div>
      </div>
      <div v-if="characters.length === 0" class="empty-hint">当前场景暂无角色</div>
    </div>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button class="menu-action" @click="handleViewCharacter">查看角色卡</button>
      <button class="menu-action" @click="handleForceMove">强制移动</button>
    </div>
  </div>
</template>

<style scoped>
.left-sidebar { position: relative; padding: var(--space-3); height: 100%; overflow-y: auto; }
.section { margin-bottom: var(--space-4); }
.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: var(--space-2);
}
.scene-group { margin-bottom: var(--space-2); }
.group-header {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px var(--space-2);
  cursor: pointer;
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
}
.group-header:hover { background: var(--color-page-bg); }
.arrow { transition: transform var(--transition-fast); }
.arrow.open { transform: rotate(0deg); }
.scene-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  transition: background var(--transition-fast);
}
.scene-item:hover { background: var(--color-page-bg); }
.scene-item.active { background: rgba(59, 130, 246, 0.1); color: var(--color-accent); }
.scene-dot { font-size: 8px; color: currentColor; }
.scene-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}
.conn-item { font-size: var(--text-xs); color: var(--color-text-secondary); padding: var(--space-1) 0; }
.arrow-link { margin: 0 4px; color: var(--color-text-muted); }
.duration { margin-left: 4px; color: var(--color-text-muted); }
.char-item { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; user-select: none; }
.char-avatar { position: relative; width: 32px; height: 32px; }
.char-avatar img,
.char-avatar span:first-child {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  background: var(--color-accent);
  color: #fff;
  object-fit: cover;
}
.online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9ca3af;
  border: 2px solid var(--color-card-bg);
}
.online-dot.online { background: var(--color-success); }
.char-info { flex: 1; min-width: 0; }
.char-name { font-size: var(--text-sm); font-weight: 500; }
.char-scene { font-size: var(--text-xs); color: var(--color-text-muted); }
.empty-hint { font-size: var(--text-xs); color: var(--color-text-muted); padding: var(--space-2); text-align: center; }
.context-menu {
  position: fixed;
  z-index: 2000;
  min-width: 140px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-card-border);
  background: var(--color-card-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  padding: 4px;
}
.menu-action {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  cursor: pointer;
}
.menu-action:hover { background: var(--color-page-bg); }

/* 当前场景卡片 */
.current-scene-card {
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}
.cscard-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: 4px; }
.cscard-dot { font-size: 8px; color: var(--color-accent); }
.cscard-title { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); flex: 1; }
.cscard-time { font-size: var(--text-xs); color: var(--color-text-muted); white-space: nowrap; }
.cscard-desc { font-size: var(--text-xs); color: var(--color-text-secondary); line-height: 1.5; margin-top: 4px; }

/* 路线图 */
.route-map {
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  background: var(--color-page-bg);
}
.route-nodes { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 4px; }
.route-node {
  flex-shrink: 0;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}
.route-node:hover { background: var(--color-card-bg); }
.route-node.current { color: var(--color-accent); }
.route-node-time { font-size: 10px; color: var(--color-text-muted); }
.route-node-name { font-size: var(--text-xs); font-weight: 500; }
.route-arrow { font-size: var(--text-xs); color: var(--color-text-muted); padding-top: 14px; }
</style>
