/**
 * useAmbientSound — 氛围音效播放 composable
 *
 * 产品设计依据：阶段 E 房间高阶体验
 *
 * 策略：
 *   - 关键词 → 音源 URL 映射表（使用免版权公开音效，可在环境变量中覆盖 CDN 前缀）
 *   - 切换场景时调用 setKeywords()，自动淡入/淡出
 *   - 用户可通过 toggle()/setVolume() 控制；偏好持久化到 localStorage
 *   - 只使用 Web Audio API + HTMLAudioElement，无外部依赖
 *
 * 音源关键词优先级：首先精确匹配，其次类别匹配，最后 fallback 到 ambient
 */

import { ref, computed, onUnmounted } from 'vue';

// ── 关键词 → 音源 URL 映射 ────────────────────────────────────────────────────
// 默认使用 freesound 风格路径；可通过 VITE_AMBIENT_CDN 前缀覆盖
const CDN = (import.meta as any).env?.VITE_AMBIENT_CDN ?? '/sounds/ambient';

export const KEYWORD_MAP: Record<string, string> = {
  // 自然
  雨夜:    `${CDN}/rain-night.mp3`,
  大雨:    `${CDN}/heavy-rain.mp3`,
  下雨:    `${CDN}/rain.mp3`,
  森林:    `${CDN}/forest.mp3`,
  海边:    `${CDN}/ocean.mp3`,
  海浪:    `${CDN}/ocean.mp3`,
  风声:    `${CDN}/wind.mp3`,
  雪地:    `${CDN}/blizzard.mp3`,
  // 场所
  酒馆:    `${CDN}/tavern.mp3`,
  市集:    `${CDN}/marketplace.mp3`,
  教堂:    `${CDN}/church.mp3`,
  洞穴:    `${CDN}/cave.mp3`,
  地牢:    `${CDN}/dungeon.mp3`,
  宫殿:    `${CDN}/palace.mp3`,
  废墟:    `${CDN}/ruins.mp3`,
  // 氛围
  战斗:    `${CDN}/battle.mp3`,
  紧张:    `${CDN}/tense.mp3`,
  神秘:    `${CDN}/mystery.mp3`,
  恐怖:    `${CDN}/horror.mp3`,
  平静:    `${CDN}/calm.mp3`,
  欢快:    `${CDN}/cheerful.mp3`,
  悲伤:    `${CDN}/sad.mp3`,
  // fallback
  ambient: `${CDN}/ambient.mp3`,
};

// 关键词所属的类别
const CATEGORY_MAP: Record<string, string[]> = {
  雨:   ['雨夜', '大雨', '下雨'],
  海:   ['海边', '海浪'],
  战:   ['战斗', '紧张'],
};

function resolveUrl(keywords: string[]): string | null {
  if (!keywords.length) return null;
  // 精确匹配
  for (const kw of keywords) {
    if (KEYWORD_MAP[kw]) return KEYWORD_MAP[kw];
  }
  // 类别匹配（关键词包含类别字）
  for (const kw of keywords) {
    for (const [cat, variants] of Object.entries(CATEGORY_MAP)) {
      if (kw.includes(cat)) {
        const found = variants.find((v) => KEYWORD_MAP[v]);
        if (found) return KEYWORD_MAP[found];
      }
    }
  }
  return null;
}

// ── Singleton —————————————————————————————————————————————————————————————────
// 全局单例：跨组件共享同一个 Audio 实例，避免多份同时播放

let _audio: HTMLAudioElement | null = null;
let _currentUrl: string | null = null;
const FADE_STEP = 0.05;
const FADE_INTERVAL = 80; // ms
let _fadeTimer: ReturnType<typeof setInterval> | null = null;

function getAudio(): HTMLAudioElement {
  if (!_audio) {
    _audio = new Audio();
    _audio.loop = true;
    _audio.volume = Number(localStorage.getItem('ambient_volume') ?? '0.4');
  }
  return _audio;
}

function clearFadeTimer() {
  if (_fadeTimer) { clearInterval(_fadeTimer); _fadeTimer = null; }
}

function fadeOut(audio: HTMLAudioElement, onDone?: () => void) {
  clearFadeTimer();
  _fadeTimer = setInterval(() => {
    if (audio.volume <= FADE_STEP) {
      audio.volume = 0;
      audio.pause();
      clearFadeTimer();
      onDone?.();
    } else {
      audio.volume = Math.max(0, audio.volume - FADE_STEP);
    }
  }, FADE_INTERVAL);
}

function fadeIn(audio: HTMLAudioElement, targetVolume: number) {
  clearFadeTimer();
  audio.volume = 0;
  _fadeTimer = setInterval(() => {
    if (audio.volume >= targetVolume - FADE_STEP) {
      audio.volume = targetVolume;
      clearFadeTimer();
    } else {
      audio.volume = Math.min(targetVolume, audio.volume + FADE_STEP);
    }
  }, FADE_INTERVAL);
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useAmbientSound() {
  const enabled = ref(localStorage.getItem('ambient_enabled') !== '0');
  const volume = ref(Number(localStorage.getItem('ambient_volume') ?? '0.4'));
  const currentKeywords = ref<string[]>([]);
  const isPlaying = ref(false);

  const currentLabel = computed(() => {
    if (!currentKeywords.value.length) return '';
    return currentKeywords.value.join(' · ');
  });

  function persistPrefs() {
    localStorage.setItem('ambient_enabled', enabled.value ? '1' : '0');
    localStorage.setItem('ambient_volume', String(volume.value));
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v));
    const audio = getAudio();
    if (!audio.paused) audio.volume = volume.value;
    persistPrefs();
  }

  function toggle() {
    enabled.value = !enabled.value;
    persistPrefs();
    if (!enabled.value) {
      const audio = getAudio();
      fadeOut(audio, () => { isPlaying.value = false; });
    } else if (currentKeywords.value.length) {
      play(currentKeywords.value);
    }
  }

  function play(keywords: string[]) {
    if (!enabled.value) return;
    const url = resolveUrl(keywords);
    if (!url) return;
    const audio = getAudio();

    if (_currentUrl === url && !audio.paused) return; // 已在播放同一音源

    const doPlay = () => {
      try {
        audio.src = url;
        _currentUrl = url;
        audio.play().then(() => {
          isPlaying.value = true;
          fadeIn(audio, volume.value);
        }).catch(() => {
          // 浏览器 autoplay policy 阻止：记录待播状态，等用户有交互时重试
          isPlaying.value = false;
        });
      } catch {
        isPlaying.value = false;
      }
    };

    if (!audio.paused) {
      fadeOut(audio, doPlay);
    } else {
      doPlay();
    }
  }

  /** 切换到新关键词；空数组时停止 */
  function setKeywords(keywords: string[]) {
    currentKeywords.value = keywords;
    if (!keywords.length) {
      const audio = getAudio();
      if (!audio.paused) fadeOut(audio, () => { isPlaying.value = false; });
      return;
    }
    play(keywords);
  }

  function stop() {
    const audio = getAudio();
    fadeOut(audio, () => { isPlaying.value = false; });
    currentKeywords.value = [];
    _currentUrl = null;
  }

  // 组件卸载时不停止全局音频（保持跨组件持续播放）
  // 但需清除 fade timer 避免内存泄漏
  onUnmounted(() => {
    // 不 stop()，仅取消注册
  });

  return {
    enabled,
    volume,
    isPlaying,
    currentLabel,
    currentKeywords,
    setKeywords,
    setVolume,
    toggle,
    stop,
  };
}
