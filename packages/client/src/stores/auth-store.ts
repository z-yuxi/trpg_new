import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('token') || '');
  const userId = ref<string>('');
  const nickname = ref<string>('');
  const avatarUrl = ref<string>('');

  const isLoggedIn = computed(() => !!token.value);

  function setAuth(data: { token: string; userId: string; nickname: string; avatarUrl?: string }): void {
    token.value = data.token;
    userId.value = data.userId;
    nickname.value = data.nickname;
    avatarUrl.value = data.avatarUrl || '';
    localStorage.setItem('token', data.token);
  }

  function logout(): void {
    token.value = '';
    userId.value = '';
    nickname.value = '';
    avatarUrl.value = '';
    localStorage.removeItem('token');
  }

  return { token, userId, nickname, avatarUrl, isLoggedIn, setAuth, logout };
});
