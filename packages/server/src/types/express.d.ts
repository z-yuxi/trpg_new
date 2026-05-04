import type { User } from '@trpg/shared';

/**
 * 扩展 Express Request，注入 passport/jwt 中间件设置的 user 字段。
 * 使用 getAuthedUser(req) 可在路由中安全获取，已认证时返回 User，否则抛 AuthenticationError。
 */
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
