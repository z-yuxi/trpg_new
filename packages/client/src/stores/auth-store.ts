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

  const isLoggedIn = computed(() => !!token.value && !isTokenExpired());

  function isTokenExpired(): boolean {
    const expiresAt = Number(localStorage.getItem('token_expires_at') || '0');
    if (!expiresAt) return false; // 没有设置过期时间则不判断（向后兼容）
    return Date.now() >= expiresAt;
  }

  function setAuth(data: { token: string; userId: string; nickname: string; avatarUrl?: string; isCreator?: boolean; expiresIn?: number }): void {
    token.value = data.token;
    userId.value = data.userId;
    nickname.value = data.nickname;
    avatarUrl.value = data.avatarUrl || '';
    if (typeof data.isCreator === 'boolean') {
      isCreator.value = data.isCreator;
      localStorage.setItem('is_creator', data.isCreator ? '1' : '0');
    }
    localStorage.setItem('token', data.token);
    if (data.expiresIn) {
      localStorage.setItem('token_expires_at', String(Date.now() + data.expiresIn * 1000));
    }
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
    localStorage.removeItem('token_expires_at');
  }

  return { token, userId, nickname, avatarUrl, isLoggedIn, isCreator, setAuth, logout, isTokenExpired };
});
