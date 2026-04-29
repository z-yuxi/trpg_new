/**
 * X-Idempotency-Key 中间件
 *
 * 对 POST 请求检查 X-Idempotency-Key 请求头：
 * - 若 Redis 已有此 key 的缓存响应，直接返回（幂等复现）
 * - 若无缓存，放行请求并在响应完成后将结果写入 Redis（TTL 24h）
 *
 * 适用于：apply、confirm、group、formGroup 等关键变更操作。
 * 客户端需为每次新操作生成唯一 key（推荐 UUID v4）。
 */
import type { Request, Response, NextFunction } from 'express';
import { redis } from '../db/redis';

const IDEMPOTENCY_TTL_SECONDS = 86_400; // 24 小时
const IDEMPOTENCY_REDIS_PREFIX = 'idempotency:';

/** key 校验：只允许字母、数字、连字符、下划线，最长 128 字符 */
const VALID_KEY_RE = /^[a-zA-Z0-9\-_]{4,128}$/;

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 只处理 POST 请求
  if (req.method !== 'POST') {
    next();
    return;
  }

  const idempotencyKey = req.headers['x-idempotency-key'];
  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    // 无 key → 直接放行（不强制要求）
    next();
    return;
  }

  if (!VALID_KEY_RE.test(idempotencyKey)) {
    res.status(400).json({ error: 'Invalid X-Idempotency-Key format', error_code: 'VALIDATION_FAILED' });
    return;
  }

  const redisKey = `${IDEMPOTENCY_REDIS_PREFIX}${idempotencyKey}`;

  try {
    const cached = await redis.get(redisKey);
    if (cached) {
      // 幂等命中：返回缓存的响应
      const { statusCode, body } = JSON.parse(cached) as { statusCode: number; body: unknown };
      res.status(statusCode).json(body);
      return;
    }
  } catch {
    // Redis 不可用时降级放行，不阻断请求
    next();
    return;
  }

  // 拦截 res.json 以捕获响应内容
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    // 只缓存成功响应（2xx）
    if (res.statusCode >= 200 && res.statusCode < 300) {
      redis.setex(redisKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify({ statusCode: res.statusCode, body }))
        .catch(() => { /* 缓存失败不影响响应 */ });
    }
    return originalJson(body);
  };

  next();
}
