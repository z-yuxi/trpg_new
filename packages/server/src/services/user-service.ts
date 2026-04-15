import bcrypt from 'bcryptjs';
import { db } from '../db';
import { generateId, generateRoomCode } from '@trpg/shared';
import type { User } from '@trpg/shared';

const BCRYPT_ROUNDS = 12;
const UID_START = 1000000;

export class UserService {
  async register(params: {
    phone: string;
    password: string;
    nickname: string;
  }): Promise<User> {
    const { phone, password, nickname } = params;

    // Check if phone already exists
    const existing = await db('users').where({ phone }).first();
    if (existing) {
      throw new Error('该手机号已注册');
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const id = generateId();

    // Generate unique UID
    const maxUidRow = await db('users').max('uid as maxUid').first();
    const uid = Math.max(UID_START, ((maxUidRow?.maxUid as number) ?? UID_START - 1) + 1);

    await db('users').insert({
      id,
      uid,
      phone,
      password_hash,
      nickname,
      avatar_url: '',
      user_type: JSON.stringify(['player']),
      creator_level: 1,
      coins: 0,
      subscription_type: 'free',
    });

    return this.findById(id) as Promise<User>;
  }

  async findById(id: string): Promise<User | null> {
    const row = await db('users').where({ id }).first();
    if (!row) return null;
    return this.rowToUser(row);
  }

  async findByPhone(phone: string): Promise<User | null> {
    const row = await db('users').where({ phone }).first();
    if (!row) return null;
    return this.rowToUser(row);
  }

  async updateProfile(id: string, updates: Partial<Pick<User, 'nickname' | 'avatar_url'>>): Promise<User> {
    await db('users').where({ id }).update(updates);
    const user = await this.findById(id);
    if (!user) throw new Error('User not found');
    return user;
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }

  private rowToUser(row: Record<string, unknown>): User {
    return {
      id: row['id'] as string,
      uid: row['uid'] as number,
      phone: row['phone'] as string,
      password_hash: row['password_hash'] as string,
      nickname: row['nickname'] as string,
      avatar_url: row['avatar_url'] as string,
      user_type: typeof row['user_type'] === 'string' ? JSON.parse(row['user_type'] as string) : row['user_type'] as string[],
      creator_level: row['creator_level'] as number,
      coins: Number(row['coins']),
      subscription_type: row['subscription_type'] as User['subscription_type'],
      created_at: row['created_at'] as Date,
    };
  }
}

export const userService = new UserService();
// re-export generateRoomCode for use in other services
export { generateRoomCode };
