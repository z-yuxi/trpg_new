import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test_jwt_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test_jwt_refresh_secret';

const redisStore = new Map<string, string>();

vi.mock('../db/redis', () => ({
  redis: {
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const key of keys) {
        if (redisStore.delete(key)) n += 1;
      }
      return n;
    }),
    scan: vi.fn(async () => ['0', [] as string[]]),
    // Lua CHECK_AND_DEL 模拟：检查两个 key 都存在，原子删除并返回 1；否则返回 0
    eval: vi.fn(async (_script: string, _numkeys: number, ...keys: string[]) => {
      const [allowKey, idleKey] = keys;
      if (redisStore.has(allowKey) && redisStore.has(idleKey)) {
        redisStore.delete(allowKey);
        redisStore.delete(idleKey);
        return 1;
      }
      return 0;
    }),
  },
}));

vi.mock('../services/user-service', () => ({
  userService: {
    findById: vi.fn(async (id: string) => ({ id, phone: '13800000000' })),
    findByPhone: vi.fn(),
    verifyPassword: vi.fn(),
  },
}));

import { AuthService } from '../services/auth-service';
import { redis } from '../db/redis';

describe('AuthService token lifecycle', () => {
  const service = new AuthService();
  const user = { id: 'u-1' } as any;

  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
  });

  it('generateTokens 写入 allow(30d) + idle(7d) 两个 refresh 键', async () => {
    const tokens = service.generateTokens(user);

    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.expires_in).toBe(3600);

    // allow + idle 两次 set
    expect((redis.set as any).mock.calls.length).toBe(2);
    const calls = (redis.set as any).mock.calls as Array<[string, string, string, number]>;

    const allowCall = calls.find((c) => c[0].startsWith('refresh:u-1:'));
    const idleCall = calls.find((c) => c[0].startsWith('refresh_idle:u-1:'));

    expect(allowCall).toBeTruthy();
    expect(idleCall).toBeTruthy();
    expect(allowCall?.[2]).toBe('EX');
    expect(idleCall?.[2]).toBe('EX');
    expect(allowCall?.[3]).toBe(30 * 24 * 60 * 60);
    expect(idleCall?.[3]).toBe(7 * 24 * 60 * 60);
  });

  it('refreshTokens 在 idle 键缺失时拒绝（超过7天不活跃）', async () => {
    const tokens = service.generateTokens(user);

    const idleKey = [...redisStore.keys()].find((k) => k.startsWith('refresh_idle:u-1:'));
    expect(idleKey).toBeTruthy();
    redisStore.delete(idleKey!);

    await expect(service.refreshTokens(tokens.refresh_token)).rejects.toThrow(
      'Refresh token has been revoked, expired, or idle timeout exceeded',
    );
  });

  it('refreshTokens 成功后轮换：旧键被删除并发新 token', async () => {
    const tokens = service.generateTokens(user);
    const beforeKeys = [...redisStore.keys()];

    const rotated = await service.refreshTokens(tokens.refresh_token);

    expect(rotated.access_token).toBeTruthy();
    expect(rotated.refresh_token).toBeTruthy();

    // 旧 refresh 对应键应被删除（再有新键写入）
    const afterKeys = [...redisStore.keys()];
    const staleKeysStillExist = beforeKeys.filter((k) => afterKeys.includes(k));
    expect(staleKeysStillExist.length).toBe(0);

    const newAllow = afterKeys.find((k) => k.startsWith('refresh:u-1:'));
    const newIdle = afterKeys.find((k) => k.startsWith('refresh_idle:u-1:'));
    expect(newAllow).toBeTruthy();
    expect(newIdle).toBeTruthy();
  });
});
