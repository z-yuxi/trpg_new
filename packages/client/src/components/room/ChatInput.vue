<script setup lang="ts">
import { ref } from 'vue';
import SvgIcon from '../SvgIcon.vue';

const emit = defineEmits<{
  send: [content: string, messageType: string];
  command: [commandStr: string];
}>();

const content = ref('');
const messageType = ref<'narrative' | 'ooc'>('narrative');
const showDicePanel = ref(false);
const customDice = ref('');

const quickDice = ['1d20', '1d100', '2d6', '3d6', '4d6'];

function send() {
  const text = content.value.trim();
  if (!text) return;
  if (text.startsWith('/')) {
    emit('command', text);
  } else {
    emit('send', text, messageType.value);
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
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}
</script>

<template>
  <div class="chat-input-area">
    <!-- 骰子快捷面板 -->
    <div v-if="showDicePanel" class="dice-panel">
      <button v-for="d in quickDice" :key="d" class="dice-quick-btn" @click="rollDice(d)">{{ d }}</button>
      <div class="dice-custom">
        <input v-model="customDice" placeholder="自定义 如 2d10+3" @keydown.enter="rollCustom" />
        <button @click="rollCustom">掷</button>
      </div>
    </div>

    <div class="input-row">
      <!-- 消息类型 -->
      <select v-model="messageType" class="type-select">
        <option value="narrative">叙述</option>
        <option value="ooc">OOC</option>
      </select>

      <!-- 骰子按钮 -->
      <button class="icon-btn" :class="{ active: showDicePanel }" @click="showDicePanel = !showDicePanel" title="骰子">
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
.chat-input-area { border-top: 1px solid var(--color-card-border); padding: var(--space-3); background: var(--color-card-bg); }
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
</style>
