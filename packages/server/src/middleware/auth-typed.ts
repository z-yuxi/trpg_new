import type { Request } from 'express';
import type { User } from '@trpg/shared';

/**
 * 认证失败异常，携带 HTTP 状态码 401。
 * 由 getAuthedUser() 在 req.user 缺失时抛出。
 */
export class AuthenticationError extends Error {
  readonly status = 401;
  constructor() {
    super('Authentication required');
    this.name = 'AuthenticationError';
  }
}

/**
 * 从已通过 authMiddleware 的请求中取出已认证用户。
 *
 * 用途：替代路由层 `req.user!.id` 非空断言，提供统一的认证失败出口。
 * 无 user 时抛 AuthenticationError（status=401），有 user 时返回窄化类型。
 *
 * @example
 *   const user = getAuthedUser(req);
 *   // user 类型为 User，无需 `!` 断言
 */
export function getAuthedUser(req: Request): User {
  if (!req.user) {
    throw new AuthenticationError();
  }
  return req.user;
}
