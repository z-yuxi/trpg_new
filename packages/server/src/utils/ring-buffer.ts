import { redis, RedisKeys } from '../db/redis';
import { SnowflakeGenerator } from '@trpg/shared';

/**
 * 从 Redis 环形缓冲区中获取某 ID 之后的所有消息
 * @param campaignId - 团 ID
 * @param afterId - 上次收到的消息 ID（Snowflake）
 * @returns 该 ID 之后的所有缓冲消息
 */
export async function getMessagesAfter(campaignId: string, afterId: string): Promise<unknown[]> {
  const key = RedisKeys.messageBuffer(campaignId);
  // Redis List 是头插，最新消息在 index 0
  const rawMessages = await redis.lrange(key, 0, -1);

  // 将字符串反序列化为对象
  const messages = rawMessages
    .map((raw) => {
      try {
        return JSON.parse(raw) as { id: string };
      } catch {
        return null;
      }
    })
    .filter((m): m is { id: string } => m !== null);

  // 找到 afterId 之后的消息（时间更晚的）
  const result = messages.filter((m) => SnowflakeGenerator.compare(m.id, afterId) > 0);

  // 按时间正序返回（最旧在前）
  result.sort((a, b) => SnowflakeGenerator.compare(a.id, b.id));

  return result;
}

/**
 * 获取缓冲区中的最新 N 条消息
 */
export async function getRecentMessages(campaignId: string, count: number): Promise<unknown[]> {
  const key = RedisKeys.messageBuffer(campaignId);
  // 获取最近 count 条（头部是最新的）
  const rawMessages = await redis.lrange(key, 0, count - 1);

  const messages = rawMessages
    .map((raw) => {
      try {
        return JSON.parse(raw) as { id: string };
      } catch {
        return null;
      }
    })
    .filter((m): m is { id: string } => m !== null);

  // 按时间正序返回
  messages.sort((a, b) => SnowflakeGenerator.compare(a.id, b.id));

  return messages;
}
