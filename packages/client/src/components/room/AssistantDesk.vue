<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../SvgIcon.vue';
import type { CharacterCard } from '@trpg/shared';

const props = defineProps<{
  character?: CharacterCard;
  commands: { name: string; description: string }[];
  diceHistory: { expression: string; result: number; time: string }[];
  isGm: boolean;
}>();

const emit = defineEmits<{
  'fill-command': [command: string];
  'broadcast': [content: string];
}>();

const activeTab = ref<'char' | 'cmds' | 'dice' | 'gm'>('char');
const broadcastContent = ref('');

function doFill(cmd: string) {
  emit('fill-command', cmd);
}

function doBroadcast() {
  if (broadcastContent.value.trim()) {
    emit('broadcast', broadcastContent.value.trim());
    broadcastContent.value = '';
  }
}

const tabs = [
  { key: 'char', icon: 'icon-npc', label: '角色卡' },
  { key: 'cmds', icon: 'icon-list', label: '命令' },
  { key: 'dice', icon: 'icon-history', label: '历史' },
];
</script>

<template>
  <div class="assistant-desk">
    <!-- Tab 头 -->
    <div class="desk-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="desk-tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = (tab.key as any)"
        :title="tab.label"
      >
        <SvgIcon :name="tab.icon" :size="16" />
      </button>
      <button v-if="isGm" class="desk-tab" :class="{ active: activeTab === 'gm' }" @click="activeTab = 'gm'" title="GM广播">
        <SvgIcon name="icon-broadcast" :size="16" />
      </button>
    </div>

    <div class="desk-content">
      <!-- 角色卡摘要 -->
      <div v-if="activeTab === 'char'">
        <div v-if="!character" class="empty-hint">未选择角色</div>
        <div v-else>
          <div class="char-header">
            <div class="char-avatar-lg">?</div>
            <div>
              <div class="char-name">card_id: {{ character.card_id }}</div>
            </div>
          </div>
          <div class="attrs">
            <div v-for="(val, key) in character.attributes" :key="key" class="attr-item">
              <span class="attr-key">{{ key }}</span>
              <span class="attr-val">{{ val }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 命令参考 -->
      <div v-else-if="activeTab === 'cmds'">
        <div v-for="cmd in commands" :key="cmd.name" class="cmd-item" @click="doFill(`/${cmd.name}`)">
          <span class="cmd-name">/{{ cmd.name }}</span>
          <span class="cmd-desc">{{ cmd.description }}</span>
        </div>
        <div v-if="commands.length === 0" class="empty-hint">暂无可用命令</div>
      </div>

      <!-- 骰子历史 -->
      <div v-else-if="activeTab === 'dice'">
        <div v-for="(roll, i) in diceHistory" :key="i" class="dice-hist-item">
          <SvgIcon name="icon-dice" :size="14" />
          <span class="dice-expr">{{ roll.expression }}</span>
          <span class="dice-eq">=</span>
          <span class="dice-result">{{ roll.result }}</span>
          <span class="dice-time">{{ roll.time }}</span>
        </div>
        <div v-if="diceHistory.length === 0" class="empty-hint">暂无骰子记录</div>
      </div>

      <!-- GM 广播 -->
      <div v-else-if="activeTab === 'gm' && isGm">
        <p class="panel-label">公告广播</p>
        <textarea v-model="broadcastContent" class="broadcast-input" placeholder="输入广播内容..." rows="4" />
        <button class="broadcast-btn" @click="doBroadcast">发送广播</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assistant-desk { display: flex; flex-direction: column; height: 100%; }
.desk-tabs { display: flex; border-bottom: 1px solid var(--color-card-border); padding: var(--space-1) var(--space-2); gap: 2px; }
.desk-tab {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer; border-radius: var(--radius-md);
  color: var(--color-text-muted); transition: background var(--transition-fast);
}
.desk-tab:hover, .desk-tab.active { background: var(--color-page-bg); color: var(--color-accent); }
.desk-content { flex: 1; overflow-y: auto; padding: var(--space-3); }
.char-header { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.char-avatar-lg {
  width: 48px; height: 48px; border-radius: 50%; background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: var(--text-xl); font-weight: 700;
}
.char-name { font-weight: 600; font-size: var(--text-base); }
.attrs { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.attr-item { display: flex; justify-content: space-between; font-size: var(--text-sm); padding: 4px 0; border-bottom: 1px solid var(--color-card-border); }
.attr-key { color: var(--color-text-secondary); }
.attr-val { font-weight: 600; font-family: var(--font-mono); }
.cmd-item { padding: var(--space-2); border-radius: var(--radius-md); cursor: pointer; transition: background var(--transition-fast); }
.cmd-item:hover { background: var(--color-page-bg); }
.cmd-name { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-accent); margin-right: 8px; }
.cmd-desc { font-size: var(--text-xs); color: var(--color-text-secondary); }
.dice-hist-item { display: flex; align-items: center; gap: 6px; font-size: var(--text-sm); padding: var(--space-1) 0; border-bottom: 1px solid var(--color-card-border); }
.dice-expr { font-family: var(--font-mono); color: var(--color-text-secondary); }
.dice-result { font-weight: 700; color: var(--color-accent); }
.dice-time { margin-left: auto; font-size: var(--text-xs); color: var(--color-text-muted); }
.panel-label { font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-2); }
.broadcast-input {
  width: 100%; padding: var(--space-2); border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm);
  resize: vertical; font-family: var(--font-sans);
}
.broadcast-btn {
  margin-top: var(--space-2); width: 100%; padding: var(--space-2); background: var(--color-accent);
  color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm);
}
.broadcast-btn:hover { background: var(--color-accent-hover); }
.empty-hint { text-align: center; color: var(--color-text-muted); font-size: var(--text-sm); padding: var(--space-6); }
</style>
