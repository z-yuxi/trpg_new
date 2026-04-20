import { defineStore } from 'pinia';
import { ref } from 'vue';
import { socketClient } from '../socket/socket-client';
import { getToken } from '../utils/api';

export const useNotificationStore = defineStore('notifications', () => {
  const unreadCount = ref(0);
  const initialized = ref(false);

  async function fetchUnreadCount(): Promise<void> {
    const token = getToken();
    if (!token) {
      unreadCount.value = 0;
      return;
    }

    try {
      const response = await fetch('/api/notifications/unread-count', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const body = await response.json() as { count?: number };
      unreadCount.value = Number(body.count ?? 0);
    } catch {
      // ignore network errors
    }
  }

  function connect(): void {
    const token = getToken();
    if (!token || initialized.value) return;

    socketClient.setToken(token);
    socketClient.connectUser();
    socketClient.onNotificationNew(() => {
      unreadCount.value += 1;
    });
    socketClient.onUnreadCountChanged((data) => {
      unreadCount.value = Number(data.count ?? 0);
    });
    initialized.value = true;
  }

  async function bootstrap(): Promise<void> {
    connect();
    await fetchUnreadCount();
  }

  function setUnreadCount(count: number): void {
    unreadCount.value = Math.max(0, count);
  }

  return {
    unreadCount,
    fetchUnreadCount,
    bootstrap,
    setUnreadCount,
  };
});
