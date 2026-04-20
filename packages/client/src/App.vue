<script setup lang="ts">
import { onMounted, ref } from 'vue';
import IconSprite from './components/IconSprite.vue';
import { useNotificationStore } from './stores/notification-store';

interface DeferredInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const notificationStore = useNotificationStore();
const isOffline = ref(!navigator.onLine);
const deferredPrompt = ref<DeferredInstallPromptEvent | null>(null);
const showInstallPrompt = ref(false);

function shouldShowInstallPrompt() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const dismissed = localStorage.getItem('pwa-install-dismissed') === '1';
  return window.innerWidth < 768 && !isStandalone && !dismissed;
}

function dismissInstallPrompt() {
  showInstallPrompt.value = false;
  localStorage.setItem('pwa-install-dismissed', '1');
}

async function installPwa() {
  if (!deferredPrompt.value) return;
  await deferredPrompt.value.prompt();
  const choice = await deferredPrompt.value.userChoice;
  if (choice.outcome === 'accepted') {
    showInstallPrompt.value = false;
    localStorage.setItem('pwa-install-dismissed', '1');
  }
}

onMounted(() => {
  notificationStore.bootstrap();

  const syncOnlineState = () => {
    isOffline.value = !navigator.onLine;
  };

  window.addEventListener('online', syncOnlineState);
  window.addEventListener('offline', syncOnlineState);
  window.addEventListener('beforeinstallprompt', ((event: Event) => {
    event.preventDefault();
    deferredPrompt.value = event as DeferredInstallPromptEvent;
    showInstallPrompt.value = shouldShowInstallPrompt();
  }) as EventListener);
  window.addEventListener('appinstalled', () => {
    showInstallPrompt.value = false;
    deferredPrompt.value = null;
    localStorage.setItem('pwa-install-dismissed', '1');
  });

  showInstallPrompt.value = shouldShowInstallPrompt();
});
</script>

<template>
  <IconSprite />
  <div v-if="isOffline" class="offline-banner">当前离线，部分功能不可用</div>
  <button v-if="showInstallPrompt" class="install-banner" @click="installPwa">
    <span>添加到主屏幕，获得更接近原生 App 的体验</span>
    <strong @click.stop="dismissInstallPrompt">稍后</strong>
  </button>
  <router-view />
</template>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2600;
  padding: 10px 16px;
  text-align: center;
  background: #f59e0b;
  color: #111827;
  font-size: var(--text-sm);
  font-weight: 600;
}

.install-banner {
  position: fixed;
  right: 16px;
  bottom: calc(72px + env(safe-area-inset-bottom, 0px));
  z-index: 2500;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(320px, calc(100vw - 32px));
  padding: 12px 14px;
  border: none;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.92);
  color: #f8fafc;
  text-align: left;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.24);
}

.install-banner strong {
  color: #fbbf24;
  font-size: var(--text-sm);
}

@media (min-width: 769px) {
  .install-banner {
    bottom: 24px;
  }
}
</style>
