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

describe('Personal membership pending order recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('restores pending order and resolves paid status on first query', async () => {
    localStorage.setItem('membership_pending_order', JSON.stringify({ orderId: 'ord_123', ts: Date.now() }));

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/users/me') {
        return {
          id: 'u-1',
          nickname: 'tester',
          avatar_url: '',
          intro: '',
          tags: [],
          subscription_type: 'free',
          creator_level: 1,
          coins: 0,
        };
      }
      if (path === '/membership/benefits') {
        return { tier: 'free', expires_at: null };
      }
      if (path === '/users/me/stats') {
        return { joined_campaigns: 1, created_campaigns: 0, total_hours: 2 };
      }
      if (path === '/membership/orders/ord_123') {
        return { status: 'paid' };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const wrapper = mount(Personal, {
      global: {
        stubs: {
          Teleport: true,
          SvgIcon: true,
          TCard: { template: '<div><slot /></div>' },
          TInput: { template: '<input />' },
          TTag: { template: '<span><slot /></span>' },
          TButton: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });

    await flushPromises();
    await flushPromises();

    expect(apiGetMock).toHaveBeenCalledWith('/membership/orders/ord_123');
    expect(localStorage.getItem('membership_pending_order')).toBeNull();

    const usersMeCalls = apiGetMock.mock.calls.filter(([path]) => path === '/users/me').length;
    const benefitsCalls = apiGetMock.mock.calls.filter(([path]) => path === '/membership/benefits').length;

    expect(usersMeCalls).toBeGreaterThanOrEqual(2);
    expect(benefitsCalls).toBeGreaterThanOrEqual(2);

    wrapper.unmount();
  });

  it('allows manual query to resolve pending order to paid', async () => {
    localStorage.setItem('membership_pending_order', JSON.stringify({ orderId: 'ord_123', ts: Date.now() }));

    let orderQueryCount = 0;
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/users/me') {
        return {
          id: 'u-1',
          nickname: 'tester',
          avatar_url: '',
          intro: '',
          tags: [],
          subscription_type: 'free',
          creator_level: 1,
          coins: 0,
        };
      }
      if (path === '/membership/benefits') {
        return { tier: 'free', expires_at: null };
      }
      if (path === '/users/me/stats') {
        return { joined_campaigns: 1, created_campaigns: 0, total_hours: 2 };
      }
      if (path === '/membership/orders/ord_123') {
        orderQueryCount += 1;
        if (orderQueryCount === 1) return { status: 'pending' };
        return { status: 'paid' };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const wrapper = mount(Personal, {
      global: {
        stubs: {
          Teleport: true,
          SvgIcon: true,
          TCard: { template: '<div><slot /></div>' },
          TInput: { template: '<input />' },
          TTag: { template: '<span><slot /></span>' },
          TButton: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });

    await flushPromises();
    await flushPromises();

    const openModalBtn = wrapper.findAll('button').find((b) => b.text().includes('升级会员'));
    expect(openModalBtn).toBeDefined();
    await openModalBtn!.trigger('click');
    await flushPromises();

    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询支付结果'));
    expect(queryBtn).toBeDefined();
    await queryBtn!.trigger('click');
    await flushPromises();
    await flushPromises();

    expect(orderQueryCount).toBeGreaterThanOrEqual(2);
    expect(localStorage.getItem('membership_pending_order')).toBeNull();

    const usersMeCalls = apiGetMock.mock.calls.filter(([path]) => path === '/users/me').length;
    const benefitsCalls = apiGetMock.mock.calls.filter(([path]) => path === '/membership/benefits').length;
    expect(usersMeCalls).toBeGreaterThanOrEqual(2);
    expect(benefitsCalls).toBeGreaterThanOrEqual(2);

    wrapper.unmount();
  });

  it('clears pending order when manual query resolves to failed', async () => {
    localStorage.setItem('membership_pending_order', JSON.stringify({ orderId: 'ord_123', ts: Date.now() }));

    let orderQueryCount = 0;
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/users/me') {
        return {
          id: 'u-1',
          nickname: 'tester',
          avatar_url: '',
          intro: '',
          tags: [],
          subscription_type: 'free',
          creator_level: 1,
          coins: 0,
        };
      }
      if (path === '/membership/benefits') {
        return { tier: 'free', expires_at: null };
      }
      if (path === '/users/me/stats') {
        return { joined_campaigns: 1, created_campaigns: 0, total_hours: 2 };
      }
      if (path === '/membership/orders/ord_123') {
        orderQueryCount += 1;
        if (orderQueryCount === 1) return { status: 'pending' };
        return { status: 'failed' };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const wrapper = mount(Personal, {
      global: {
        stubs: {
          Teleport: true,
          SvgIcon: true,
          TCard: { template: '<div><slot /></div>' },
          TInput: { template: '<input />' },
          TTag: { template: '<span><slot /></span>' },
          TButton: {
            template: '<button @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });

    await flushPromises();
    await flushPromises();

    const openModalBtn = wrapper.findAll('button').find((b) => b.text().includes('升级会员'));
    expect(openModalBtn).toBeDefined();
    await openModalBtn!.trigger('click');
    await flushPromises();

    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询支付结果'));
    expect(queryBtn).toBeDefined();
    await queryBtn!.trigger('click');
    await flushPromises();
    await flushPromises();

    expect(orderQueryCount).toBeGreaterThanOrEqual(2);
    expect(localStorage.getItem('membership_pending_order')).toBeNull();

    const queryBtnAfterFailed = wrapper.findAll('button').find((b) => b.text().includes('查询支付结果'));
    expect(queryBtnAfterFailed).toBeUndefined();

    wrapper.unmount();
  });
});
