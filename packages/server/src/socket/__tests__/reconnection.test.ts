import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SnowflakeGenerator } from '@trpg/shared';

// Mock Redis 模块
vi.mock('../../db/redis', () => {
  const data: Record<string, string[]> = {};
  return {
    redis: {
      lrange: vi.fn(async (key: string, start: number, end: number) => {
        const list = data[key] || [];
        if (end === -1) return list.slice(start);
        return list.slice(start, end + 1);
      }),
      lpush: vi.fn(async (key: string, ...values: string[]) => {
        if (!data[key]) data[key] = [];
        for (const v of values) data[key].unshift(v);
        return data[key].length;
      }),
      ltrim: vi.fn(async () => 'OK'),
      sadd: vi.fn(async () => 1),
      srem: vi.fn(async () => 1),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
      incr: vi.fn(async () => 1),
      expire: vi.fn(async () => 1),
    },
    RedisKeys: {
      campaignOnline: (id: string) => `campaign:${id}:online`,
      userSocket: (id: string) => `user:${id}:socket`,
      messageBuffer: (id: string) => `campaign:${id}:messages`,
      rateLimit: (id: string) => `ratelimit:${id}`,
    },
  };
});

// Mock db 模块
vi.mock('../../db', () => ({
  db: vi.fn(() => ({
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn(async () => []),
    first: vi.fn(async () => null),
  })),
}));

describe('Ring Buffer - getMessagesAfter', () => {
  const gen = new SnowflakeGenerator(5);

  it('应返回 afterId 之后的消息（从 Redis 缓冲区）', async () => {
    // 动态导入以确保 mock 生效
    const { getMessagesAfter } = await import('../../utils/ring-buffer');
    const { redis, RedisKeys } = await import('../../db/redis');

    const campaignId = 'test-campaign-1';
    const id1 = gen.nextId();
    const id2 = gen.nextId();
    const id3 = gen.nextId();

    // 模拟缓冲区中已有消息（最新在前）
    const mockLrange = vi.mocked(redis.lrange);
    mockLrange.mockResolvedValueOnce([
      JSON.stringify({ id: id3 }),
      JSON.stringify({ id: id2 }),
      JSON.stringify({ id: id1 }),
    ]);

    const result = await getMessagesAfter(campaignId, id1);
    expect(result).toHaveLength(2);
    // 结果应按时间正序
    const ids = (result as { id: string }[]).map((m) => m.id);
    expect(ids[0]).toBe(id2);
    expect(ids[1]).toBe(id3);

    void RedisKeys; // suppress unused warning
  });

  it('缓冲区为空时应返回空数组', async () => {
    const { getMessagesAfter } = await import('../../utils/ring-buffer');
    const { redis } = await import('../../db/redis');

    const mockLrange = vi.mocked(redis.lrange);
    mockLrange.mockResolvedValueOnce([]);

    const result = await getMessagesAfter('empty-campaign', gen.nextId());
    expect(result).toHaveLength(0);
  });
});

describe('Reconnection Handler - handleReconnection', () => {
  it('无 lastEventId 时不发送 missed_messages', async () => {
    const { handleReconnection } = await import('../../socket/reconnection-handler');

    const socketEmit = vi.fn();
    const socket = { emit: socketEmit } as never;

    await handleReconnection(socket, 'campaign-1', 'char-1', undefined);
    expect(socketEmit).not.toHaveBeenCalled();
  });

  it('有 lastEventId 且缓冲区中有消息时发送 missed_messages', async () => {
    const { handleReconnection } = await import('../../socket/reconnection-handler');
    const { redis } = await import('../../db/redis');

    const gen2 = new SnowflakeGenerator(6);
    const id1 = gen2.nextId();
    const id2 = gen2.nextId();

    const mockLrange = vi.mocked(redis.lrange);
    mockLrange.mockResolvedValueOnce([
      JSON.stringify({ id: id2, content: 'hello', campaign_id: 'c1', scene_id: 's1', sender_user_id: 'u1' }),
    ]);

    const socketEmit = vi.fn();
    const socket = { emit: socketEmit } as never;

    await handleReconnection(socket, 'c1', 'char-1', id1);
    expect(socketEmit).toHaveBeenCalledWith('missed_messages', expect.objectContaining({
      messages: expect.any(Array),
    }));
  });
});
