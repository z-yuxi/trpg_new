import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import type { User } from '@trpg/shared';
import { userService } from './user-service';
import { redis } from '../db/redis';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set');
}
const _JWT_SECRET: string = JWT_SECRET;
// refresh token 使用独立密钥（与 access token 隔离）
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
if (!JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET environment variable is required but not set');
}
const _JWT_REFRESH_SECRET: string = JWT_REFRESH_SECRET;

const JWT_EXPIRES_IN = '1h';
const JWT_REFRESH_EXPIRES_IN = '30d';
const REFRESH_TOKEN_MAX_TTL = 30 * 24 * 60 * 60; // 30 天，秒
const REFRESH_TOKEN_IDLE_TTL = 7 * 24 * 60 * 60; // 7 天，秒（不活跃阈值）

function refreshAllowKey(userId: string, jti: string): string {
  return `refresh:${userId}:${jti}`;
}

function refreshIdleKey(userId: string, jti: string): string {
  return `refresh_idle:${userId}:${jti}`;
}

export interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
  jti?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;  // seconds
}

export class AuthService {
  generateTokens(user: User): AuthTokens {
    const jti = uuidv4();
    const accessPayload: TokenPayload = { userId: user.id, type: 'access' };
    const refreshPayload: TokenPayload = { userId: user.id, type: 'refresh', jti };

    const access_token = jwt.sign(accessPayload, _JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refresh_token = jwt.sign(refreshPayload, _JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });

    // 双键策略：
    // 1) 白名单键（30天）控制 refresh token 的最长生命周期
    // 2) 空闲键（7天）控制连续不活跃时失效
    void redis.set(refreshAllowKey(user.id, jti), '1', 'EX', REFRESH_TOKEN_MAX_TTL);
    void redis.set(refreshIdleKey(user.id, jti), '1', 'EX', REFRESH_TOKEN_IDLE_TTL);

    return {
      access_token,
      refresh_token,
      expires_in: 60 * 60,
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    const payload = jwt.verify(token, _JWT_SECRET) as TokenPayload;
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return payload;
  }

  verifyRefreshToken(token: string): TokenPayload {
    const payload = jwt.verify(token, _JWT_REFRESH_SECRET) as TokenPayload;
    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return payload;
  }

  async login(phone: string, password: string): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await userService.findByPhone(phone);
    if (!user) {
      throw new Error('手机号或密码错误');
    }

    const valid = await userService.verifyPassword(user, password);
    if (!valid) {
      throw new Error('手机号或密码错误');
    }

    const tokens = this.generateTokens(user);
    return { user, tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = this.verifyRefreshToken(refreshToken);
    if (!payload.jti) {
      throw new Error('Invalid refresh token: missing jti');
    }

    // 需同时满足：
    // - allow 键存在：未被吊销，且未超过 30 天最大生命周期
    // - idle 键存在：7 天内有活跃（通过 refresh 行为维持）
    const allowExists = await redis.get(refreshAllowKey(payload.userId, payload.jti));
    const idleExists = await redis.get(refreshIdleKey(payload.userId, payload.jti));
    if (!allowExists || !idleExists) {
      throw new Error('Refresh token has been revoked, expired, or idle timeout exceeded');
    }

    // 撤销旧 token（一次性使用）
    await redis.del(refreshAllowKey(payload.userId, payload.jti), refreshIdleKey(payload.userId, payload.jti));

    const user = await userService.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }
    return this.generateTokens(user);
  }

  /** 撤销用户的所有 refresh token（改密码/注销时使用） */
  async revokeAllTokens(userId: string): Promise<void> {
    const patterns = [`refresh:${userId}:*`, `refresh_idle:${userId}:*`];
    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }
  }
}

export const authService = new AuthService();
