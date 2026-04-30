import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const {
  pushMock,
  setAuthMock,
  logoutMock,
  apiGetMock,
  apiPostMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  setAuthMock: vi.fn(),
  logoutMock: vi.fn(),
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('../stores/auth-store', () => ({
  useAuthStore: () => ({
    isLoggedIn: true,
    token: 'token-1',
    userId: 'u-1',
    nickname: 'tester',
    avatarUrl: '',
    setAuth: setAuthMock,
    logout: logoutMock,
  }),
}));

vi.mock('../stores/notification-store', () => ({
  useNotificationStore: () => ({
    unreadCount: 0,
  }),
}));

vi.mock('../composables/useTheme', () => ({
  useTheme: () => ({
    currentTheme: ref('day'),
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('../utils/api', () => ({
  api: {
    get: apiGetMock,
    post: apiPostMock,
    put: vi.fn(),
  },
  getToken: () => 'token-1',
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import Personal from '../views/Personal.vue';

const defaultGetMock = async (path: string) => {
  if (path === '/users/me') {
    return { id: 'u-1', nickname: 'tester', avatar_url: '', intro: '', tags: [], subscription_type: 'free', creator_level: 1, coins: 0 };
  }
  if (path === '/membership/benefits') {
    return { tier: 'free', expires_at: null };
  }
  if (path === '/users/me/stats') {
    return { joined_campaigns: 1, created_campaigns: 0, total_hours: 2 };
  }
  throw new Error(`unexpected path: ${path}`);
};

const DEFAULT_STUBS = {
  Teleport: true,
  SvgIcon: true,
  TCard: { template: '<div><slot /></div>' },
  TInput: { template: '<input />' },
  TTag: { template: '<span><slot /></span>' },
  TButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
};

describe('Personal membership UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    apiGetMock.mockImplementation(defaultGetMock);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('loads membership benefits on mount', async () => {
    const wrapper = mount(Personal, { global: { stubs: DEFAULT_STUBS } });
    await flushPromises();

    expect(apiGetMock).toHaveBeenCalledWith('/membership/benefits');
    expect(apiGetMock).toHaveBeenCalledWith('/users/me');

    wrapper.unmount();
  });

  it('clicking 升级会员 opens modal and 立即支付 calls api.post', async () => {
    apiPostMock.mockResolvedValue(undefined);

    const wrapper = mount(Personal, { global: { stubs: DEFAULT_STUBS } });
    await flushPromises();

    const openModalBtn = wrapper.findAll('button').find((b) => b.text().includes('升级会员'));
    expect(openModalBtn).toBeDefined();
    await openModalBtn!.trigger('click');
    await flushPromises();

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('立即支付'));
    expect(confirmBtn).toBeDefined();
    await confirmBtn!.trigger('click');
    await flushPromises();

    expect(apiPostMock).toHaveBeenCalledWith(
      '/membership/orders',
      expect.objectContaining({ sku: expect.any(String), channel: expect.any(String) }),
      expect.any(String),
    );

    wrapper.unmount();
  });

  it('shows error message when createOrder fails', async () => {
    const { ElMessage } = await import('element-plus');
    apiPostMock.mockRejectedValue(new Error('支付服务不可用'));

    const wrapper = mount(Personal, { global: { stubs: DEFAULT_STUBS } });
    await flushPromises();

    const openModalBtn = wrapper.findAll('button').find((b) => b.text().includes('升级会员'));
    expect(openModalBtn).toBeDefined();
    await openModalBtn!.trigger('click');
    await flushPromises();

    const confirmBtn = wrapper.findAll('button').find((b) => b.text().includes('立即支付'));
    expect(confirmBtn).toBeDefined();
    await confirmBtn!.trigger('click');
    await flushPromises();

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('支付服务不可用'));

    wrapper.unmount();
  });
});
