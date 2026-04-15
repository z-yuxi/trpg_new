import jwt from 'jsonwebtoken';
import type { User } from '@trpg/shared';
import { userService } from './user-service';

const JWT_SECRET = process.env.JWT_SECRET ?? 'trpg-platform-default-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const JWT_REFRESH_EXPIRES_IN = '30d';

export interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;  // seconds
}

export class AuthService {
  generateTokens(user: User): AuthTokens {
    const accessPayload: TokenPayload = { userId: user.id, type: 'access' };
    const refreshPayload: TokenPayload = { userId: user.id, type: 'refresh' };

    const access_token = jwt.sign(accessPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const refresh_token = jwt.sign(refreshPayload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });

    return {
      access_token,
      refresh_token,
      expires_in: 7 * 24 * 3600,
    };
  }

  verifyAccessToken(token: string): TokenPayload {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }
    return payload;
  }

  verifyRefreshToken(token: string): TokenPayload {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
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
    const user = await userService.findById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }
    return this.generateTokens(user);
  }
}

export const authService = new AuthService();
