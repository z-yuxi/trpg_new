<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import SvgIcon from './SvgIcon.vue';

type ClueTheme = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';

interface RenderToken {
  char: string;
  displayChar: string;
  index: number;
  burnt: boolean;
  style: Record<string, string>;
}

const props = withDefaults(defineProps<{
  title: string;
  content: string;
  theme: string;
  senderName?: string;
  isRevealing?: boolean;
  clueId?: string;
  createdAt?: string | Date | null;
}>(), {
  isRevealing: false,
  senderName: '',
  clueId: '',
  createdAt: null,
});

const timers: number[] = [];
const blurActive = ref(false);
const revealFromStorage = ref(false);
const cyberDisplay = ref<string[]>([]);

const themeName = computed<ClueTheme | 'river'>(() => {
  const valid = ['river', 'blur', 'fragment', 'wave', 'ancient', 'blood', 'ash', 'cyber'];
  return (valid.includes(props.theme) ? props.theme : 'river') as ClueTheme | 'river';
});

const revealKey = computed(() => `trpg:clue:seen:${props.clueId || `${props.title}:${props.content}`}`);

const effectiveReveal = computed(() => props.isRevealing || revealFromStorage.value);

const formattedTime = computed(() => {
  if (!props.createdAt) return '';
  const date = props.createdAt instanceof Date ? props.createdAt : new Date(props.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
});

function seeded(index: number, salt: number): number {
  const raw = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

const tokens = computed<RenderToken[]>(() => {
  const chars = Array.from(props.content || '');
  if (cyberDisplay.value.length !== chars.length) {
    cyberDisplay.value = chars.slice();
  }
  return chars.map((char, index) => ({
    char,
    displayChar: cyberDisplay.value[index] ?? char,
    index,
    burnt: themeName.value === 'ash' && seeded(index, 9) < 0.28,
    style: {
      '--char-index': String(index),
      '--dx': `${Math.round((seeded(index, 1) - 0.5) * 60)}px`,
      '--dy': `${Math.round((seeded(index, 2) - 0.5) * 60)}px`,
      '--dr': `${Math.round((seeded(index, 3) - 0.5) * 30)}deg`,
    },
  }));
});

function clearTimers() {
  while (timers.length) {
    const timer = timers.pop();
    if (timer) window.clearTimeout(timer);
  }
}

function triggerCyberReveal() {
  clearTimers();
  const chars = Array.from(props.content || '');
  cyberDisplay.value = chars.map((char) => (char.trim() ? '' : char));
  const randomPool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&*?';

  chars.forEach((char, index) => {
    if (!char.trim()) {
      cyberDisplay.value[index] = char;
      return;
    }

    const startDelay = index * 30;
    const interval = window.setTimeout(() => {
      let frame = 0;
      const scramble = window.setInterval(() => {
        frame += 1;
        cyberDisplay.value[index] = randomPool[(index + frame * 7) % randomPool.length];
        if (frame >= 3) {
          window.clearInterval(scramble);
          cyberDisplay.value[index] = char;
        }
      }, 40);
      timers.push(scramble);
    }, startDelay);
    timers.push(interval);
  });
}

function markSeenIfNeeded() {
  if (!revealKey.value || !effectiveReveal.value) return;
  localStorage.setItem(revealKey.value, '1');
}

function syncRevealState() {
  const alreadySeen = revealKey.value ? localStorage.getItem(revealKey.value) === '1' : false;
  revealFromStorage.value = !alreadySeen && !!props.clueId;
  if (themeName.value === 'cyber' && effectiveReveal.value) {
    triggerCyberReveal();
  } else {
    cyberDisplay.value = Array.from(props.content || '');
  }
  markSeenIfNeeded();
}

function activateBlur() {
  if (themeName.value !== 'blur') return;
  blurActive.value = true;
}

watch(() => [props.clueId, props.content, props.theme, props.isRevealing], syncRevealState, { immediate: true });

onMounted(syncRevealState);
onBeforeUnmount(clearTimers);
</script>

<template>
  <article class="clue-card" :class="`clue-theme-${themeName}`">
    <div class="clue-card__head">
      <div class="clue-card__badge">
        <SvgIcon name="icon-scroll" :size="15" />
        <span>线索</span>
      </div>
      <span v-if="senderName" class="clue-card__sender">来自 {{ senderName }}</span>
    </div>

    <div class="clue-card__body">
      <h4 class="clue-card__title">{{ title }}</h4>
      <div
        class="clue-card__content"
        :class="{ 'is-revealing': effectiveReveal, 'is-active': blurActive }"
        @click="activateBlur"
      >
        <template v-for="token in tokens" :key="token.index">
          <span
            class="clue-char"
            :class="{ 'clue-space': token.char === ' ', 'is-burnt': token.burnt }"
            :style="token.style"
          >{{ themeName === 'cyber' ? token.displayChar : token.char }}</span>
        </template>
      </div>
      <div v-if="formattedTime || senderName" class="clue-card__meta">
        <span v-if="formattedTime">{{ formattedTime }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.clue-card {
  border: 1px solid var(--color-card-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent), var(--color-card-bg);
  padding: var(--space-3);
  color: var(--color-text-primary);
}

.clue-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.clue-card__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.clue-card__sender,
.clue-card__meta {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.clue-card__body {
  position: relative;
}

.clue-card__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-base);
  font-weight: 700;
}

.clue-card__content {
  font-size: var(--text-sm);
  line-height: 1.8;
}

.clue-card__meta {
  margin-top: var(--space-2);
  text-align: right;
}
</style>
