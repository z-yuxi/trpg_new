import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

function normalizeToken(raw: string | null): string {
  if (!raw) return '';
  if (raw === 'undefined' || raw === 'null') return '';
  return raw;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(normalizeToken(localStorage.getItem('token')));
  const userId = ref<string>(localStorage.getItem('user_id') || '');
  const nickname = ref<string>(localStorage.getItem('nickname') || '');
  const avatarUrl = ref<string>(localStorage.getItem('avatar_url') || '');
  const isCreator = ref<boolean>(localStorage.getItem('is_creator') === '1');
  const isAdmin = ref<boolean>(localStorage.getItem('is_admin') === '1');

  type Identity = 'player' | 'creator';
  const _savedIdentity = localStorage.getItem('active_identity') as Identity | null;
  const activeIdentity = ref<Identity>(_savedIdentity ?? 'player');

  const isLoggedIn = computed(() => !!token.value && !isTokenExpired());

  function isTokenExpired(): boolean {
    const expiresAt = Number(localStorage.getItem('token_expires_at') || '0');
    if (!expiresAt) return false; // 没有设置过期时间则不判断（向后兼容）
    return Date.now() >= expiresAt;
  }

  function setAuth(data: {
    token: string;
    userId: string;
    nickname: string;
    avatarUrl?: string;
    isCreator?: boolean;
    isAdmin?: boolean;
    userType?: string[];
    expiresIn?: number;
  }): void {
    token.value = data.token;
    userId.value = data.userId;
    nickname.value = data.nickname;
    avatarUrl.value = data.avatarUrl || '';

    localStorage.setItem('token', data.token);
    localStorage.setItem('user_id', data.userId);
    localStorage.setItem('nickname', data.nickname);
    if (data.avatarUrl !== undefined) localStorage.setItem('avatar_url', data.avatarUrl || '');

    // 优先使用 userType 数组派生角色，其次使用显式布尔字段（向后兼容）
    if (Array.isArray(data.userType)) {
      const creator = data.userType.includes('creator') || data.userType.includes('admin');
      const admin = data.userType.includes('admin');
      isCreator.value = creator;
      isAdmin.value = admin;
      localStorage.setItem('is_creator', creator ? '1' : '0');
      localStorage.setItem('is_admin', admin ? '1' : '0');
    } else {
      if (typeof data.isCreator === 'boolean') {
        isCreator.value = data.isCreator;
        localStorage.setItem('is_creator', data.isCreator ? '1' : '0');
      }
      if (typeof data.isAdmin === 'boolean') {
        isAdmin.value = data.isAdmin;
        localStorage.setItem('is_admin', data.isAdmin ? '1' : '0');
      }
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
    isAdmin.value = false;
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('nickname');
    localStorage.removeItem('avatar_url');
    localStorage.removeItem('is_creator');
    localStorage.removeItem('is_admin');
    localStorage.removeItem('token_expires_at');
    activeIdentity.value = 'player';
    localStorage.removeItem('active_identity');
  }

  function setActiveIdentity(id: Identity): void {
    // 非创作者不允许切换到 creator 身份
    if (id === 'creator' && !isCreator.value) return;
    activeIdentity.value = id;
    localStorage.setItem('active_identity', id);
  }

  return { token, userId, nickname, avatarUrl, isLoggedIn, isCreator, isAdmin, activeIdentity, setActiveIdentity, setAuth, logout, isTokenExpired };
});
