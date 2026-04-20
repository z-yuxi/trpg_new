<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps<{
  isGm?: boolean;
  currentSceneType?: string;
  myCharacter?: { id: string; name: string; avatarUrl?: string } | null;
  roleplayableNpcs?: { id: string; name: string; avatarUrl?: string }[];
  authDisplayName?: string;
  selectedIdentityKey?: string;
  prefillText?: string;
  rulesetCommands?: Array<{ name: string; description: string; paramHint?: string }>;
}>();

const emit = defineEmits<{
  send: [content: string, messageType: string, senderIdentity: string];
  command: [commandStr: string];
}>();

type IdentityOption = { key: string; label: string; avatarUrl?: string };

const identityOptions = computed<IdentityOption[]>(() => {
  const list: IdentityOption[] = [];
  if (props.myCharacter) {
    list.push({ key: `char:${props.myCharacter.id}`, label: props.myCharacter.name, avatarUrl: props.myCharacter.avatarUrl });
  }
  if (props.isGm) {
    list.push({ key: 'gm', label: 'GM' });
  }
  if (props.isGm && props.roleplayableNpcs) {
    props.roleplayableNpcs.forEach((npc) => {
      list.push({ key: `npc:${npc.id}`, label: npc.name, avatarUrl: npc.avatarUrl });
    });
  }
  if (props.currentSceneType === 'lobby' && props.authDisplayName) {
    list.push({ key: 'platform', label: props.authDisplayName });
  }
  return list;
});

const selectedIdentityKey = ref<string>('');

watch(() => props.selectedIdentityKey, (val) => {
  if (val) selectedIdentityKey.value = val;
}, { immediate: true });

const selectedIdentity = computed<IdentityOption>(() => {
  if (!selectedIdentityKey.value) return identityOptions.value[0] ?? { key: 'player', label: '玩家' };
  return identityOptions.value.find((o) => o.key === selectedIdentityKey.value) ?? identityOptions.value[0] ?? { key: 'player', label: '玩家' };
});

const showIdentityDropdown = ref(false);

watch(identityOptions, (list) => {
  if (!list.length) return;
  if (!selectedIdentityKey.value || !list.some((item) => item.key === selectedIdentityKey.value)) {
    selectedIdentityKey.value = list[0]!.key;
  }
}, { immediate: true });

function selectIdentity(option: IdentityOption) {
  selectedIdentityKey.value = option.key;
  showIdentityDropdown.value = false;
}

const content = ref('');
watch(() => props.prefillText, (val) => { if (val) { content.value = val; } }, { immediate: false });
const messageType = ref<'narrative' | 'ooc'>('narrative');
const showDicePanel = ref(false);
const customDice = ref('');

// ── 指令自动补全 ───────────────────────────────────────────────────────────
const showCommandList = ref(false);
const commandHighlight = ref(0);

const filteredCommands = computed(() => {
  if (!content.value.startsWith('/')) return [];
  const filter = content.value.slice(1).toLowerCase();
  const commands = props.rulesetCommands ?? [];
  if (!filter) return commands.slice(0, 12);
  return commands.filter(c => c.name.toLowerCase().startsWith(filter) || c.description.toLowerCase().includes(filter)).slice(0, 12);
});

watch(content, (val) => {
  if (val.startsWith('/') && filteredCommands.value.length > 0) {
    showCommandList.value = true;
    commandHighlight.value = 0;
  } else {
    showCommandList.value = false;
  }
});

function selectCommand(cmd: { name: string; description: string; paramHint?: string }) {
  content.value = '/' + cmd.name + (cmd.paramHint ? ' ' + cmd.paramHint : ' ');
  showCommandList.value = false;
  nextTick(() => {
    const el = document.querySelector('.chat-input-area .text-input') as HTMLTextAreaElement | null;
    el?.focus();
  });
}

function onCommandKeydown(e: KeyboardEvent) {
  if (!showCommandList.value || filteredCommands.value.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    commandHighlight.value = (commandHighlight.value + 1) % filteredCommands.value.length;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    commandHighlight.value = (commandHighlight.value - 1 + filteredCommands.value.length) % filteredCommands.value.length;
  } else if (e.key === 'Tab' || e.key === 'Enter') {
    if (showCommandList.value) {
      e.preventDefault();
      const selected = filteredCommands.value[commandHighlight.value];
      if (selected) selectCommand(selected);
    }
  } else if (e.key === 'Escape') {
    showCommandList.value = false;
  }
}

const quickDice = ['1d20', '1d100', '2d6', '3d6', '4d6'];

function syncKeyboardOffset() {
  if (!window.visualViewport) return;
  const offset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
  document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
}

function send() {
  const text = content.value.trim();
  if (!text) return;
  if (text.startsWith('/')) {
    emit('command', text);
  } else {
    emit('send', text, messageType.value, selectedIdentity.value.key);
  }
  content.value = '';
  showDicePanel.value = false;
}

function rollDice(expr: string) {
  emit('command', `/roll ${expr}`);
  showDicePanel.value = false;
}

function rollCustom() {
  const expr = customDice.value.trim();
  if (expr) { rollDice(expr); customDice.value = ''; }
}

function onKeydown(e: KeyboardEvent) {
  // 先处理补全列表快捷键
  onCommandKeydown(e);
  if (e.defaultPrevented) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

onMounted(() => {
  syncKeyboardOffset();
  window.visualViewport?.addEventListener('resize', syncKeyboardOffset);
  window.visualViewport?.addEventListener('scroll', syncKeyboardOffset);
});

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', syncKeyboardOffset);
  window.visualViewport?.removeEventListener('scroll', syncKeyboardOffset);
  document.documentElement.style.setProperty('--keyboard-offset', '0px');
});
</script>

<template>
  <div class="chat-input-area" @click="showIdentityDropdown = false">
    <!-- 骰子快捷面板 -->
    <div v-if="showDicePanel" class="dice-panel">
      <button v-for="d in quickDice" :key="d" class="dice-quick-btn" @click="rollDice(d)">{{ d }}</button>
      <div class="dice-custom">
        <input v-model="customDice" placeholder="自定义 如 2d10+3" @keydown.enter="rollCustom" />
        <button @click="rollCustom">掷</button>
      </div>
    </div>

    <!-- 指令补全浮层 -->
    <div v-if="showCommandList && filteredCommands.length > 0" class="command-list">
      <div
        v-for="(cmd, idx) in filteredCommands"
        :key="cmd.name"
        class="command-item"
        :class="{ highlighted: idx === commandHighlight }"
        @mousedown.prevent="selectCommand(cmd)"
      >
        <span class="command-name">/{{ cmd.name }}</span>
        <span v-if="cmd.paramHint" class="command-param">{{ cmd.paramHint }}</span>
        <span class="command-desc">{{ cmd.description }}</span>
      </div>
    </div>

    <div class="input-row">
      <!-- 身份选择器 -->
      <div v-if="identityOptions.length > 0" class="identity-selector" @click.stop="showIdentityDropdown = !showIdentityDropdown">
        <div class="identity-avatar">
          <img v-if="selectedIdentity.avatarUrl" :src="selectedIdentity.avatarUrl" />
          <span v-else class="identity-fallback">{{ selectedIdentity.label[0] }}</span>
        </div>
        <div v-if="showIdentityDropdown" class="identity-dropdown" @click.stop>
          <div
            v-for="option in identityOptions"
            :key="option.key"
            class="identity-option"
            :class="{ selected: option.key === selectedIdentity.key }"
            @click="selectIdentity(option)"
          >
            <div class="identity-option-avatar">
              <img v-if="option.avatarUrl" :src="option.avatarUrl" />
              <span v-else class="identity-fallback">{{ option.label[0] }}</span>
            </div>
            <span>{{ option.label }}</span>
          </div>
        </div>
      </div>

      <!-- 消息类型 -->
      <select v-model="messageType" class="type-select">
        <option value="narrative">叙述</option>
        <option value="ooc">OOC</option>
      </select>

      <!-- 骰子按钮 -->
      <button class="icon-btn" :class="{ active: showDicePanel }" @click.stop="showDicePanel = !showDicePanel" title="骰子">
        <SvgIcon name="icon-dice" :size="18" />
      </button>

      <!-- 输入框 -->
      <textarea
        v-model="content"
        class="text-input"
        placeholder="输入消息，/ 开头为命令，Shift+Enter 换行"
        rows="1"
        @keydown="onKeydown"
      />

      <!-- 发送按钮 -->
      <button class="send-btn" @click="send" :disabled="!content.trim()">
        <SvgIcon name="icon-send" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-input-area { position: relative; border-top: 1px solid var(--color-card-border); padding: var(--space-3); background: var(--color-card-bg); }
.dice-panel {
  display: flex; flex-wrap: wrap; gap: var(--space-2);
  padding: var(--space-3); border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md); margin-bottom: var(--space-2); background: var(--color-page-bg);
}
.dice-quick-btn {
  padding: 4px 10px; border: 1px solid var(--color-card-border); border-radius: var(--radius-full);
  background: var(--color-card-bg); cursor: pointer; font-family: var(--font-mono); font-size: var(--text-sm);
}
.dice-quick-btn:hover { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
.dice-custom { display: flex; gap: var(--space-2); width: 100%; }
.dice-custom input {
  flex: 1; padding: 4px 8px; border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md); background: var(--color-input-bg); font-size: var(--text-sm);
}
.dice-custom button {
  padding: 4px 12px; background: var(--color-accent); color: #fff; border: none;
  border-radius: var(--radius-md); cursor: pointer; font-size: var(--text-sm);
}
.input-row { display: flex; align-items: flex-end; gap: var(--space-2); }

/* 身份选择器 */
.identity-selector {
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
}
.identity-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-card-border);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-page-bg);
  transition: border-color var(--transition-fast);
}
.identity-avatar:hover { border-color: var(--color-accent); }
.identity-avatar img { width: 100%; height: 100%; object-fit: cover; }
.identity-fallback { font-size: var(--text-xs); font-weight: 600; color: var(--color-accent); }
.identity-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 160px;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0,0,0,0.16);
  z-index: 100;
  padding: 4px;
}
.identity-option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-sm);
}
.identity-option:hover { background: var(--color-page-bg); }
.identity-option.selected { background: rgba(59,130,246,0.1); color: var(--color-accent); }
.identity-option-avatar {
  width: 24px; height: 24px; border-radius: 50%; overflow: hidden;
  background: var(--color-page-bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.identity-option-avatar img { width: 100%; height: 100%; object-fit: cover; }

.type-select {
  height: 36px; padding: 0 var(--space-2); border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md); background: var(--color-input-bg);
  color: var(--color-text-secondary); font-size: var(--text-sm); cursor: pointer;
}
.icon-btn {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  border: none; background: none; cursor: pointer; color: var(--color-text-secondary);
  border-radius: var(--radius-md); flex-shrink: 0; transition: background var(--transition-fast);
}
.icon-btn:hover, .icon-btn.active { background: var(--color-page-bg); color: var(--color-accent); }
.text-input {
  flex: 1; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-input-border);
  border-radius: var(--radius-md); background: var(--color-input-bg); color: var(--color-text-primary);
  font-size: var(--text-sm); resize: none; line-height: 1.5; max-height: 120px; overflow-y: auto;
  font-family: var(--font-sans);
}
.text-input:focus { outline: none; border-color: var(--color-input-focus); }
.send-btn {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  border: none; background: var(--color-accent); color: #fff; border-radius: var(--radius-md);
  cursor: pointer; flex-shrink: 0; transition: background var(--transition-fast);
}
.send-btn:hover:not(:disabled) { background: var(--color-accent-hover); }
.send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 指令补全列表 */
.command-list {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: var(--color-card-bg);
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-md);
  box-shadow: 0 -4px 16px rgba(0,0,0,0.12);
  max-height: 240px;
  overflow-y: auto;
  z-index: 200;
  margin-bottom: 4px;
}
.command-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 12px;
  cursor: pointer;
  font-size: var(--text-sm);
  border-bottom: 1px solid var(--color-card-border);
}
.command-item:last-child { border-bottom: none; }
.command-item:hover, .command-item.highlighted { background: var(--color-page-bg); }
.command-name { font-family: var(--font-mono); color: var(--color-accent); font-weight: 600; flex-shrink: 0; }
.command-param { font-family: var(--font-mono); color: var(--color-text-secondary); font-size: var(--text-xs); flex-shrink: 0; }
.command-desc { color: var(--color-text-muted); font-size: var(--text-xs); flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }

@media (max-width: 768px) {
  .chat-input-area {
    position: sticky;
    bottom: 0;
    z-index: 12;
    padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px) + var(--keyboard-offset, 0px));
    box-shadow: 0 -10px 20px rgba(15, 23, 42, 0.08);
  }

  .input-row {
    align-items: stretch;
  }

  .text-input {
    min-height: 44px;
  }
}
</style>
