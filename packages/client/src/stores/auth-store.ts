import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

function normalizeToken(raw: string | null): string {
  if (!raw) return '';
  if (raw === 'undefined' || raw === 'null') return '';
  return raw;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(normalizeToken(localStorage.getItem('token')));
  const userId = ref<string>('');
  const nickname = ref<string>('');
  const avatarUrl = ref<string>('');
  const isCreator = ref<boolean>(localStorage.getItem('is_creator') === '1');

  const isLoggedIn = computed(() => !!token.value);

  function setAuth(data: { token: string; userId: string; nickname: string; avatarUrl?: string; isCreator?: boolean }): void {
    token.value = data.token;
    userId.value = data.userId;
    nickname.value = data.nickname;
    avatarUrl.value = data.avatarUrl || '';
    if (typeof data.isCreator === 'boolean') {
      isCreator.value = data.isCreator;
      localStorage.setItem('is_creator', data.isCreator ? '1' : '0');
    }
    localStorage.setItem('token', data.token);
  }

  function logout(): void {
    token.value = '';
    userId.value = '';
    nickname.value = '';
    avatarUrl.value = '';
    isCreator.value = false;
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('is_creator');
  }

  return { token, userId, nickname, avatarUrl, isLoggedIn, isCreator, setAuth, logout };
});
