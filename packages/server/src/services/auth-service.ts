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

const JWT_EXPIRES_IN = '15m';
const JWT_REFRESH_EXPIRES_IN = '7d';
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 天，秒

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

    // 将 refresh token jti 写入 Redis 白名单
    void redis.set(`refresh:${user.id}:${jti}`, '1', 'EX', REFRESH_TOKEN_TTL);

    return {
      access_token,
      refresh_token,
      expires_in: 15 * 60,
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

    // 验证 Redis 白名单中存在该 token
    const exists = await redis.get(`refresh:${payload.userId}:${payload.jti}`);
    if (!exists) {
      throw new Error('Refresh token has been revoked or expired');
    }

    // 撤销旧 token（一次性使用）
    await redis.del(`refresh:${payload.userId}:${payload.jti}`);

    const user = await userService.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }
    return this.generateTokens(user);
  }

  /** 撤销用户的所有 refresh token（改密码/注销时使用） */
  async revokeAllTokens(userId: string): Promise<void> {
    const pattern = `refresh:${userId}:*`;
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

export const authService = new AuthService();
