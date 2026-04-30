import bcrypt from 'bcryptjs';
import { db } from '../db';
import { generateId, generateRoomCode } from '@trpg/shared';
import type { User } from '@trpg/shared';
import { AppError } from '../utils/app-error';

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
      throw new AppError(409, '该手机号已注册');
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

  async getStats(userId: string): Promise<{ joined_campaigns: number; created_campaigns: number; total_hours: number }> {
    const gmCampaignRows = await db('campaigns')
      .where({ gm_user_id: userId })
      .select('id');

    const joinedCampaignRows = await db('character_scene_states as css')
      .join('character_sheets as cs', 'cs.id', 'css.character_id')
      .where('cs.user_id', userId)
      .distinct('css.campaign_id as campaign_id');

    const createdCampaignIds = gmCampaignRows.map((row: Record<string, unknown>) => String(row['id']));
    const joinedCampaignIds = joinedCampaignRows.map((row: Record<string, unknown>) => String(row['campaign_id']));
    const allCampaignIds = new Set([...createdCampaignIds, ...joinedCampaignIds]);

    const participationRows = await db('scene_participations as sp')
      .join('character_sheets as cs', 'cs.id', 'sp.character_id')
      .where('cs.user_id', userId)
      .select('sp.joined_at', 'sp.left_at');

    let totalMs = 0;
    for (const row of participationRows as Array<Record<string, unknown>>) {
      const joinedAt = row['joined_at'] ? new Date(String(row['joined_at'])).getTime() : NaN;
      const leftAt = row['left_at'] ? new Date(String(row['left_at'])).getTime() : Date.now();
      if (!Number.isFinite(joinedAt) || !Number.isFinite(leftAt) || leftAt <= joinedAt) continue;
      totalMs += leftAt - joinedAt;
    }

    return {
      joined_campaigns: allCampaignIds.size,
      created_campaigns: createdCampaignIds.length,
      total_hours: Math.floor(totalMs / (1000 * 60 * 60)),
    };
  }

  async getPublicProfile(uid: string): Promise<Record<string, unknown> | null> {
    const row = await db('users')
      .where({ uid: Number(uid) })
      .select('id', 'uid', 'nickname', 'avatar_url', 'intro', 'user_type', 'subscription_type', 'creator_level', 'follower_count', 'following_count', 'created_at')
      .first();
    if (!row) return null;

    const userType = typeof row['user_type'] === 'string'
      ? JSON.parse(row['user_type'] as string)
      : [];

    return {
      id: row['id'],
      uid: row['uid'],
      nickname: row['nickname'],
      avatar_url: row['avatar_url'] || '',
      intro: (row['intro'] as string) || '',
      tags: userType,
      subscription_type: row['subscription_type'],
      creator_level: row['creator_level'],
      follower_count: Number(row['follower_count'] ?? 0),
      following_count: Number(row['following_count'] ?? 0),
      created_at: row['created_at'],
    };
  }

  async getUserCampaigns(uid: string): Promise<Record<string, unknown>[]> {
    const user = await db('users').where({ uid: Number(uid) }).select('id').first();
    if (!user) return [];

    return db('campaigns as c')
      .join('character_scene_states as css', 'css.campaign_id', 'c.id')
      .join('character_sheets as cs', 'cs.id', 'css.character_id')
      .where('cs.user_id', user.id)
      .select('c.id', 'c.name', 'c.status', 'c.created_at')
      .groupBy('c.id', 'c.name', 'c.status', 'c.created_at')
      .orderBy('c.created_at', 'desc');
  }

  async getHostedCampaigns(uid: string): Promise<Record<string, unknown>[]> {
    const user = await db('users').where({ uid: Number(uid) }).select('id').first();
    if (!user) return [];

    return db('campaigns')
      .where({ gm_user_id: user.id })
      .select('id', 'name', 'status', 'created_at')
      .orderBy('created_at', 'desc');
  }

  async getUserCreatedModules(uid: string): Promise<Record<string, unknown>[]> {
    const user = await db('users').where({ uid: Number(uid) }).select('id').first();
    if (!user) return [];

    const [modules, rulesets] = await Promise.all([
      db('modules').where({ author_id: user.id }).select('id', 'name', 'status', db.raw("'module' as type"), 'updated_at'),
      db('rulesets').where({ author_id: user.id }).select('id', 'name', 'status', db.raw("'ruleset' as type"), 'created_at as updated_at'),
    ]);

    return [...modules, ...rulesets].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const row = await db('users').where({ id: userId }).select('password_hash').first();
    if (!row) throw new Error('User not found');
    const valid = await bcrypt.compare(currentPassword, row.password_hash as string);
    if (!valid) throw new Error('当前密码错误');
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db('users').where({ id: userId }).update({ password_hash: newHash });
  }

  async updatePrivacySettings(userId: string, settings: {
    profile_visibility?: string;
    profile_public?: boolean;
    online_visible?: boolean;
    campaign_history_public?: boolean;
    dm_visibility?: string;
    allow_stats?: boolean;
    allow_ai_train?: boolean;
  }): Promise<void> {
    const update: Record<string, unknown> = {};
    // 同时支持两种写法：profile_visibility(string) 或 profile_public(boolean)
    if (settings.profile_visibility !== undefined) {
      update['profile_public'] = settings.profile_visibility === 'public';
    }
    if (settings.profile_public !== undefined) update['profile_public'] = settings.profile_public;
    if (settings.online_visible !== undefined) update['online_visible'] = settings.online_visible;
    if (settings.campaign_history_public !== undefined) update['campaign_history_public'] = settings.campaign_history_public;
    if (settings.dm_visibility !== undefined) update['dm_visibility'] = settings.dm_visibility;
    if (settings.allow_stats !== undefined) update['allow_stats'] = settings.allow_stats;
    if (settings.allow_ai_train !== undefined) update['allow_ai_train'] = settings.allow_ai_train;
    if (Object.keys(update).length > 0) {
      await db('users').where({ id: userId }).update(update);
    }
  }

  async updateNotificationSettings(userId: string, settings: {
    system?: boolean;
    recruit?: boolean;
    dm?: boolean;
    mention?: boolean;
    in_app?: boolean;
    email?: boolean;
    push?: boolean;
  }): Promise<void> {
    // 先读取现有值再合并，避免覆盖未传入的字段
    const existing = await db('users').where({ id: userId }).select('notification_settings').first<{ notification_settings?: string }>();
    const prev = existing?.notification_settings
      ? JSON.parse(existing.notification_settings) as Record<string, unknown>
      : {};
    const merged = { ...prev, ...settings };
    await db('users').where({ id: userId }).update({
      notification_settings: JSON.stringify(merged),
    });
  }

  /**
   * 移除 password_hash 后返回安全用户对象（用于 API 响应）。
   */
  toSafeUser(user: User): Omit<User, 'password_hash'> {
    const { password_hash: _omit, ...safe } = user;
    return safe;
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
      subscription_expires_at: (row['subscription_expires_at'] as Date | null) ?? null,
      created_at: row['created_at'] as Date,
    };
  }
}

export const userService = new UserService();
// re-export generateRoomCode for use in other services
export { generateRoomCode };
