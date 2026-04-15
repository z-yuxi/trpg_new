<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import type { Scene } from '@trpg/shared';

const props = defineProps<{
  scenes: Scene[];
  currentSceneId: string;
  characters: { id: string; name: string; avatarUrl: string; sceneId: string; online: boolean }[];
  connections: { from: string; to: string; walkDuration: number }[];
  enableConnections: boolean;
}>();

const emit = defineEmits<{ 'scene-select': [sceneId: string] }>();

const sceneTypeLabels: Record<string, string> = {
  spatial: '空间场',
  virtual: '虚拟场',
  lobby: '大厅',
};

const sceneTypeIcons: Record<string, string> = {
  spatial: 'icon-grid',
  virtual: 'icon-room',
  lobby: 'icon-broadcast',
};

function getSceneName(sceneId: string) {
  return props.scenes.find(s => s.id === sceneId)?.name ?? sceneId;
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`;
}
</script>

<template>
  <div class="left-sidebar">
    <!-- 场景导航 -->
    <div class="section">
      <div class="section-title">
        <SvgIcon name="icon-grid" :size="14" />
        <span>场景</span>
      </div>
      <div
        v-for="scene in scenes"
        :key="scene.id"
        class="scene-item"
        :class="{ active: scene.id === currentSceneId }"
        @click="emit('scene-select', scene.id)"
      >
        <SvgIcon :name="sceneTypeIcons[scene.type] ?? 'icon-room'" :size="14" />
        <span class="scene-name">{{ scene.name }}</span>
        <span class="scene-type">{{ sceneTypeLabels[scene.type] }}</span>
      </div>
      <div v-if="scenes.length === 0" class="empty-hint">暂无场景</div>
    </div>

    <!-- 路线图 -->
    <div v-if="enableConnections && connections.length" class="section">
      <div class="section-title">
        <SvgIcon name="icon-history" :size="14" />
        <span>路线</span>
      </div>
      <div v-for="(conn, i) in connections" :key="i" class="conn-item">
        <span>{{ getSceneName(conn.from) }}</span>
        <span class="arrow">→</span>
        <span>{{ getSceneName(conn.to) }}</span>
        <span class="duration">步行 {{ formatDuration(conn.walkDuration) }}</span>
      </div>
    </div>

    <!-- 角色列表 -->
    <div class="section">
      <div class="section-title">
        <SvgIcon name="icon-npc" :size="14" />
        <span>角色</span>
      </div>
      <div v-for="char in characters" :key="char.id" class="char-item">
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
      <div v-if="characters.length === 0" class="empty-hint">暂无角色</div>
    </div>
  </div>
</template>

<style scoped>
.left-sidebar { padding: var(--space-3); height: 100%; overflow-y: auto; }
.section { margin-bottom: var(--space-4); }
.section-title {
  display: flex; align-items: center; gap: var(--space-2);
  font-size: var(--text-xs); font-weight: 600; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 1px; margin-bottom: var(--space-2);
}
.scene-item {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2); border-radius: var(--radius-md); cursor: pointer;
  font-size: var(--text-sm); color: var(--color-text-secondary);
  transition: background var(--transition-fast);
}
.scene-item:hover { background: var(--color-page-bg); }
.scene-item.active { background: rgba(59,130,246,0.1); color: var(--color-accent); }
.scene-name { flex: 1; }
.scene-type { font-size: var(--text-xs); color: var(--color-text-muted); }
.conn-item { font-size: var(--text-xs); color: var(--color-text-secondary); padding: var(--space-1) 0; }
.arrow { margin: 0 4px; color: var(--color-text-muted); }
.duration { margin-left: 4px; color: var(--color-text-muted); }
.char-item { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; }
.char-avatar { position: relative; width: 32px; height: 32px; }
.char-avatar img, .char-avatar span:first-child {
  width: 32px; height: 32px; border-radius: 50%;
  display: block; background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: var(--text-xs);
}
.online-dot {
  position: absolute; bottom: 0; right: 0;
  width: 8px; height: 8px; border-radius: 50%;
  background: #9ca3af; border: 2px solid var(--color-card-bg);
}
.online-dot.online { background: var(--color-success); }
.char-info { flex: 1; }
.char-name { font-size: var(--text-sm); font-weight: 500; }
.char-scene { font-size: var(--text-xs); color: var(--color-text-muted); }
.empty-hint { font-size: var(--text-xs); color: var(--color-text-muted); padding: var(--space-2); text-align: center; }
</style>
