import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
};

/** 主 Redis 客户端（用于常规操作） */
export const redis = new Redis(redisConfig);

/** 发布用客户端 */
export const redisPub = new Redis(redisConfig);

/** 订阅用客户端 */
export const redisSub = new Redis(redisConfig);

/** Redis key 前缀生成 */
export const RedisKeys = {
  /** 团房间在线用户集合 */
  campaignOnline: (campaignId: string) => `campaign:${campaignId}:online`,
  /** 用户 socket 映射 */
  userSocket: (userId: string) => `user:${userId}:socket`,
  /** 消息环形缓冲区 */
  messageBuffer: (campaignId: string) => `campaign:${campaignId}:messages`,
  /** 限流计数 */
  rateLimit: (userId: string) => `ratelimit:${userId}`,
} as const;
