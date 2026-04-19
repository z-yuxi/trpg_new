<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElDialog } from 'element-plus';
import SvgIcon from '../SvgIcon.vue';
import GridMap from './GridMap.vue';
import { useMessageStore } from '../../stores/message-store';
import { useAuthStore } from '../../stores/auth-store';
import type { CharacterSheet, Scene, StoryTime } from '@trpg/shared';

const props = defineProps<{
  campaignId: string;
  commands: { name: string; description: string }[];
  scenes: Scene[];
  roomCharacters: Array<{ id: string; name: string; sceneId: string; personalStoryTime?: StoryTime | null }>;
  currentSceneId: string;
  npcs: Array<{ id: string; name: string; display_name?: string }>;
  isGm: boolean;
}>();

const emit = defineEmits<{
  'fill-command': [command: string];
  'broadcast': [content: string];
}>();

const authStore = useAuthStore();
const messageStore = useMessageStore();

// ── character binding ─────────────────────────────────────────────────
const selectedCharId = ref('');
const characterSheet = ref<CharacterSheet | null>(null);
const showCharSelect = ref(false);
const showAttrPanel = ref(false);
const myCharacters = ref<{ id: string; name: string }[]>([]);
const loadingChar = ref(false);

async function loadCharacterList() {
  try {
    const res = await fetch('/api/characters', { headers: { Authorization: `Bearer ${authStore.token}` } });
    if (res.ok) myCharacters.value = (await res.json()).map((c: any) => ({ id: c.id, name: c.name }));
  } catch { /* ignore */ }
}

async function loadCharacterSheet(id: string) {
  if (!id) { characterSheet.value = null; return; }
  loadingChar.value = true;
  try {
    const res = await fetch(`/api/characters/${id}`, { headers: { Authorization: `Bearer ${authStore.token}` } });
    if (res.ok) characterSheet.value = await res.json();
  } catch { /* ignore */ } finally { loadingChar.value = false; }
}

watch(selectedCharId, (id) => loadCharacterSheet(id), { immediate: true });

async function openCharSelect() {
  await loadCharacterList();
  showCharSelect.value = true;
}

function selectChar(id: string) {
  selectedCharId.value = id;
  showCharSelect.value = false;
  showAttrPanel.value = false;
}

function unbindChar() {
  selectedCharId.value = '';
  characterSheet.value = null;
  showAttrPanel.value = false;
}

// HP bar
const hpEntry = computed(() => {
  const dm = characterSheet.value?.derived_max;
  if (!dm || typeof dm !== 'object') return null;
  const keys = ['health', 'HP', 'hp', 'hit_points', 'SAN', 'san', '生命', '体力', '血量'];
  const key = keys.find(k => dm[k] !== undefined) ?? Object.keys(dm)[0];
  if (!key) return null;
  return { key, ...dm[key] };
});

const hpPercent = computed(() => {
  if (!hpEntry.value || !hpEntry.value.max) return 100;
  return Math.max(0, Math.min(100, (hpEntry.value.current / hpEntry.value.max) * 100));
});

const charInitial = computed(() => characterSheet.value?.name?.charAt(0).toUpperCase() ?? '?');
const selectedRoomCharacter = computed(() => props.roomCharacters.find((char) => char.id === selectedCharId.value) ?? null);
const currentSceneName = computed(() => {
  const sceneId = selectedRoomCharacter.value?.sceneId;
  if (!sceneId) return '未进入场景';
  return props.scenes.find((scene) => scene.id === sceneId)?.name ?? '未知场景';
});
const personalStoryTime = computed(() => selectedRoomCharacter.value?.personalStoryTime ?? null);

function formatStoryTime(storyTime: StoryTime | null | undefined): string {
  if (!storyTime) return '未同步';
  return `第${storyTime.day}日 ${String(storyTime.hour).padStart(2, '0')}:${String(storyTime.minute).padStart(2, '0')}`;
}

// ── tabs ──────────────────────────────────────────────────────────────
type TabKey = 'cmds' | 'map' | 'dice' | 'secret' | 'broadcast';
const activeTab = ref<TabKey>('cmds');
const currentScene = computed(() => props.scenes.find((scene) => scene.id === props.currentSceneId) ?? null);

// ── commands ──────────────────────────────────────────────────────────
function useCommand(cmd: { name: string }) {
  emit('fill-command', `/${cmd.name} `);
}

// ── dice history (computed from message store) ────────────────────────
const filterSkill = ref('');
const filterDateFrom = ref('');
const filterDateTo = ref('');

const allDiceMessages = computed(() => {
  const result: any[] = [];
  messageStore.messagesByScene.forEach((list) => {
    list.forEach(m => { if (m.message_type === 'dice') result.push(m); });
  });
  return result.sort((a, b) => (a.id > b.id ? -1 : 1));
});

const filteredDice = computed(() => {
  return allDiceMessages.value.filter(m => {
    const expr: string = (m.metadata as any)?.expression ?? m.content ?? '';
    if (filterSkill.value && !expr.toLowerCase().includes(filterSkill.value.toLowerCase())) return false;
    const ts = new Date(m.created_at as any).getTime();
    if (filterDateFrom.value && ts < new Date(filterDateFrom.value).getTime()) return false;
    if (filterDateTo.value && ts > new Date(filterDateTo.value).getTime() + 86400000) return false;
    return true;
  });
});

// ── secret dice log (GM only) ─────────────────────────────────────────
const secretDice = computed(() => allDiceMessages.value.filter(m => m.visible_to !== null));

function exportSecretCSV() {
  const header = '时间,表达式,结果,可见角色';
  const rows = secretDice.value.map(m => {
    const expr = (m.metadata as any)?.expression ?? m.content ?? '';
    const result = (m.metadata as any)?.total ?? '';
    const vis = Array.isArray(m.visible_to) ? m.visible_to.join(';') : '';
    const t = new Date(m.created_at as any).toLocaleString('zh-CN');
    return `"${t}","${expr}","${result}","${vis}"`;
  });
  const blob = new Blob(['\uFEFF' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `secret_dice_${Date.now()}.csv`; a.click(); URL.revokeObjectURL(url);
}

// ── broadcast ─────────────────────────────────────────────────────────
const broadcastContent = ref('');
function doBroadcast() {
  if (broadcastContent.value.trim()) {
    emit('broadcast', broadcastContent.value.trim());
    broadcastContent.value = '';
  }
}

function fmt(d: any): string {
  const date = new Date(d);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
</script>

<template>
  <div class="assistant-desk">

    <!-- 角色卡区域（置顶） -->
    <div class="char-zone">
      <template v-if="!selectedCharId">
        <button class="select-char-btn" @click="openCharSelect">
          <SvgIcon name="icon-npc" :size="16" />
          <span>选择角色</span>
        </button>
      </template>
      <template v-else>
        <div class="char-bound" @click="showAttrPanel = !showAttrPanel">
          <div class="char-avatar">{{ charInitial }}</div>
          <div class="char-info">
            <div class="char-name">{{ characterSheet?.name ?? '加载中…' }}</div>
            <div v-if="hpEntry" class="hp-bar-wrap">
              <div class="hp-bar-track">
                <div class="hp-bar-fill" :style="{ width: hpPercent + '%' }" :class="{ low: hpPercent < 30 }" />
              </div>
              <span class="hp-text">{{ hpEntry.key }}: {{ hpEntry.current }}/{{ hpEntry.max }}</span>
            </div>
            <div class="char-meta">当前场景：{{ currentSceneName }}</div>
            <div class="char-meta">个人时间：{{ formatStoryTime(personalStoryTime) }}</div>
          </div>
          <button class="unbind-btn" @click.stop="unbindChar" title="解除绑定">×</button>
        </div>
        <!-- 属性展开面板 -->
        <div v-if="showAttrPanel && characterSheet" class="attr-panel">
          <div class="attr-grid">
            <div v-for="(val, key) in characterSheet.attributes" :key="key" class="attr-cell">
              <span class="attr-k">{{ key }}</span>
              <span class="attr-v">{{ val }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Tab 头 -->
    <div class="desk-tabs">
      <button class="desk-tab" :class="{ active: activeTab === 'cmds' }" @click="activeTab = 'cmds'" title="指令">
        <SvgIcon name="icon-list" :size="16" />
      </button>
      <button class="desk-tab" :class="{ active: activeTab === 'map' }" @click="activeTab = 'map'" title="地图">
        <SvgIcon name="icon-grid" :size="16" />
      </button>
      <button class="desk-tab" :class="{ active: activeTab === 'dice' }" @click="activeTab = 'dice'" title="骰子历史">
        <SvgIcon name="icon-history" :size="16" />
      </button>
      <template v-if="isGm">
        <button class="desk-tab" :class="{ active: activeTab === 'secret' }" @click="activeTab = 'secret'" title="暗骰日志">
          <SvgIcon name="icon-lock" :size="16" />
        </button>
        <button class="desk-tab" :class="{ active: activeTab === 'broadcast' }" @click="activeTab = 'broadcast'" title="GM广播">
          <SvgIcon name="icon-broadcast" :size="16" />
        </button>
      </template>
    </div>

    <!-- Tab 内容 -->
    <div class="desk-content">

      <!-- 指令速查 -->
      <div v-if="activeTab === 'cmds'">
        <div v-for="cmd in commands" :key="cmd.name" class="cmd-row">
          <div class="cmd-main">
            <span class="cmd-name">/{{ cmd.name }}</span>
            <span class="cmd-desc">{{ cmd.description }}</span>
          </div>
          <button class="cmd-use-btn" @click="useCommand(cmd)">使用</button>
        </div>
        <div v-if="commands.length === 0" class="empty-hint">暂无可用指令</div>
      </div>

      <div v-else-if="activeTab === 'map'" class="map-tab">
        <GridMap
          v-if="currentScene"
          :campaign-id="campaignId"
          :scene-id="currentScene.id"
          :is-g-m="false"
          :characters="roomCharacters.map((character) => ({ id: character.id, name: character.name, sceneId: character.sceneId }))"
          :npcs="npcs"
        />
        <div v-else class="empty-hint">当前没有可查看的场景地图</div>
      </div>

      <!-- 骰子历史 -->
      <div v-else-if="activeTab === 'dice'">
        <div class="filter-bar">
          <input v-model="filterSkill" class="filter-input" placeholder="按技能/表达式筛选" />
          <input v-model="filterDateFrom" type="date" class="filter-input" />
          <input v-model="filterDateTo" type="date" class="filter-input" />
        </div>
        <div v-for="(m, i) in filteredDice" :key="m.id || i" class="dice-row">
          <SvgIcon name="icon-dice" :size="13" />
          <span class="dice-expr">{{ (m.metadata as any)?.expression ?? m.content }}</span>
          <span class="dice-eq">=</span>
          <span class="dice-result">{{ (m.metadata as any)?.total ?? '?' }}</span>
          <span class="dice-time">{{ fmt(m.created_at) }}</span>
        </div>
        <div v-if="filteredDice.length === 0" class="empty-hint">暂无骰子记录</div>
      </div>

      <!-- 暗骰日志（GM 专属） -->
      <div v-else-if="activeTab === 'secret' && isGm">
        <div class="secret-header">
          <span class="pane-label">暗骰日志（共{{ secretDice.length }}条）</span>
          <button class="export-btn" @click="exportSecretCSV" :disabled="secretDice.length === 0">导出 CSV</button>
        </div>
        <div v-for="(m, i) in secretDice" :key="m.id || i" class="secret-row">
          <SvgIcon name="icon-lock" :size="13" />
          <span class="dice-expr">{{ (m.metadata as any)?.expression ?? m.content }}</span>
          <span class="dice-eq">=</span>
          <span class="dice-result">{{ (m.metadata as any)?.total ?? '?' }}</span>
          <span class="dice-time">{{ fmt(m.created_at) }}</span>
        </div>
        <div v-if="secretDice.length === 0" class="empty-hint">暂无暗骰记录</div>
      </div>

      <!-- GM 广播 -->
      <div v-else-if="activeTab === 'broadcast' && isGm">
        <p class="pane-label">公告广播</p>
        <textarea v-model="broadcastContent" class="broadcast-input" placeholder="输入广播内容…" rows="4" />
        <button class="broadcast-btn" @click="doBroadcast">发送广播</button>
      </div>

    </div>

    <!-- 角色选择弹窗 -->
    <ElDialog v-model="showCharSelect" title="选择角色" width="360px">
      <div v-if="myCharacters.length === 0" class="empty-hint">暂无角色卡，请先前往"我的"页面创建</div>
      <div v-for="c in myCharacters" :key="c.id" class="char-select-item" @click="selectChar(c.id)">
        <div class="cs-avatar">{{ c.name.charAt(0).toUpperCase() }}</div>
        <span class="cs-name">{{ c.name }}</span>
      </div>
    </ElDialog>

  </div>
</template>

<style scoped>
.assistant-desk { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* ── 角色区域 ── */
.char-zone { padding: var(--space-3); border-bottom: 1px solid var(--border-default); flex-shrink: 0; }
.select-char-btn {
  width: 100%; padding: var(--space-2) var(--space-3); display: flex; align-items: center; gap: var(--space-2);
  border: 1px dashed var(--border-default); border-radius: var(--radius-md); background: none;
  color: var(--text-secondary); cursor: pointer; font-size: var(--text-sm); justify-content: center;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.select-char-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
.char-bound {
  display: flex; align-items: center; gap: var(--space-2); cursor: pointer; padding: var(--space-1);
  border-radius: var(--radius-md); transition: background var(--transition-fast);
}
.char-bound:hover { background: var(--surface-hover); }
.char-avatar {
  width: 36px; height: 36px; border-radius: 50%; background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: var(--text-base); flex-shrink: 0;
}
.char-info { flex: 1; min-width: 0; }
.char-name { font-weight: 600; font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.char-meta { font-size: 10px; color: var(--text-secondary); margin-top: 2px; }
.hp-bar-wrap { margin-top: 2px; }
.hp-bar-track { height: 4px; background: var(--surface-hover); border-radius: 2px; overflow: hidden; }
.hp-bar-fill { height: 100%; background: var(--color-accent); border-radius: 2px; transition: width 0.3s; }
.hp-bar-fill.low { background: #e05252; }
.hp-text { font-size: 10px; color: var(--text-secondary); }
.unbind-btn {
  width: 20px; height: 20px; border: none; background: none; cursor: pointer; color: var(--text-muted);
  font-size: 16px; line-height: 1; border-radius: var(--radius-sm); flex-shrink: 0;
}
.unbind-btn:hover { color: var(--text-primary); background: var(--surface-hover); }
.attr-panel { margin-top: var(--space-2); border-top: 1px solid var(--border-default); padding-top: var(--space-2); }
.attr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.attr-cell { display: flex; justify-content: space-between; font-size: var(--text-xs); padding: 2px 4px; }
.attr-k { color: var(--text-secondary); }
.attr-v { font-weight: 600; font-family: var(--font-mono); }

/* ── tabs ── */
.desk-tabs { display: flex; border-bottom: 1px solid var(--border-default); padding: var(--space-1) var(--space-2); gap: 2px; flex-shrink: 0; }
.desk-tab {
  width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer; border-radius: var(--radius-md);
  color: var(--text-muted); transition: background var(--transition-fast), color var(--transition-fast);
}
.desk-tab:hover, .desk-tab.active { background: var(--surface-hover); color: var(--color-accent); }

/* ── content ── */
.desk-content { flex: 1; overflow-y: auto; padding: var(--space-3); }

/* 指令 */
.cmd-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-default); }
.cmd-main { flex: 1; min-width: 0; }
.cmd-name { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-accent); margin-right: 6px; }
.cmd-desc { font-size: var(--text-xs); color: var(--text-secondary); }
.cmd-use-btn {
  flex-shrink: 0; padding: 2px 8px; border: 1px solid var(--border-default); border-radius: var(--radius-sm);
  background: none; cursor: pointer; font-size: var(--text-xs); color: var(--text-primary);
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.cmd-use-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }

.map-tab { min-height: 280px; }

/* 筛选栏 */
.filter-bar { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-2); }
.filter-input {
  width: 100%; padding: 4px 8px; border: 1px solid var(--border-default); border-radius: var(--radius-sm);
  background: var(--surface-card); color: var(--text-primary); font-size: var(--text-xs);
}
.filter-input:focus { outline: none; border-color: var(--color-accent); }

/* 骰子行 */
.dice-row, .secret-row { display: flex; align-items: center; gap: 6px; font-size: var(--text-xs); padding: 5px 0; border-bottom: 1px solid var(--border-default); }
.dice-expr { font-family: var(--font-mono); color: var(--text-secondary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dice-eq { color: var(--text-muted); }
.dice-result { font-weight: 700; color: var(--color-accent); flex-shrink: 0; }
.dice-time { margin-left: auto; color: var(--text-muted); flex-shrink: 0; }

/* 暗骰 header */
.secret-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.pane-label { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }
.export-btn {
  padding: 2px 10px; border: 1px solid var(--border-default); border-radius: var(--radius-sm);
  background: none; cursor: pointer; font-size: var(--text-xs); color: var(--text-secondary);
  transition: border-color var(--transition-fast);
}
.export-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
.export-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 广播 */
.broadcast-input {
  width: 100%; padding: var(--space-2); border: 1px solid var(--border-default); border-radius: var(--radius-md);
  background: var(--surface-card); color: var(--text-primary); font-size: var(--text-sm);
  resize: vertical; font-family: var(--font-sans); box-sizing: border-box;
}
.broadcast-btn {
  margin-top: var(--space-2); width: 100%; padding: var(--space-2); background: var(--color-accent);
  color: #fff; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm);
  transition: opacity var(--transition-fast);
}
.broadcast-btn:hover { opacity: 0.85; }

/* 角色选择 */
.char-select-item {
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3);
  cursor: pointer; border-radius: var(--radius-md); transition: background var(--transition-fast);
}
.char-select-item:hover { background: var(--surface-hover); }
.cs-avatar {
  width: 32px; height: 32px; border-radius: 50%; background: var(--color-accent); color: #fff;
  display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0;
}
.cs-name { font-size: var(--text-sm); font-weight: 500; }

/* empty */
.empty-hint { text-align: center; color: var(--text-muted); font-size: var(--text-sm); padding: var(--space-6); }
</style>
