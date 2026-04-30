/**
 * BotService — 机器人账号生命周期管理
 *
 * 职责：
 * 1. 创建机器人账号（写入 users 表，is_bot=1）
 * 2. 激活 / 休眠机器人账号（bot_status 切换）
 * 3. 转运营（清除 is_bot 标记，使账号成为普通创作者）
 * 4. 查询机器人列表
 *
 * 机器人账号特征：
 * - UID 范围 1000095–1000099（固定保留 5 个位置）
 * - phone 字段为 null（机器人无手机号）
 * - password_hash 使用随机字符串（不可登录）
 * - is_bot = 1, bot_status = 'active' | 'hibernated'
 */
import bcrypt from 'bcryptjs';
import { generateId } from '@trpg/shared';
import { db } from '../db';

export interface BotAccount {
  id: string;
  uid: number;
  nickname: string;
  avatar_url: string;
  bot_label: string;
  bot_status: 'active' | 'hibernated';
  created_at: Date;
}

/** 机器人 UID 保留段 */
export const BOT_UID_RANGE = { min: 1000095, max: 1000099 } as const;

function rowToBot(row: Record<string, unknown>): BotAccount {
  return {
    id: row['id'] as string,
    uid: Number(row['uid']),
    nickname: row['nickname'] as string,
    avatar_url: (row['avatar_url'] as string) ?? '',
    bot_label: (row['bot_label'] as string) ?? '',
    bot_status: (row['bot_status'] as 'active' | 'hibernated') ?? 'hibernated',
    created_at: row['created_at'] as Date,
  };
}

export class BotService {
  /**
   * 创建一个机器人账号。
   * uid 必须在 BOT_UID_RANGE 内且未被占用。
   */
  async createBot(params: {
    uid: number;
    nickname: string;
    label: string;
    avatar_url?: string;
  }): Promise<BotAccount> {
    const { uid, nickname, label, avatar_url = '' } = params;

    if (uid < BOT_UID_RANGE.min || uid > BOT_UID_RANGE.max) {
      throw new Error(`机器人 UID 必须在 ${BOT_UID_RANGE.min}–${BOT_UID_RANGE.max} 之间`);
    }

    const existing = await db('users').where({ uid }).first();
    if (existing) {
      throw new Error(`UID ${uid} 已被占用`);
    }

    // 使用随机密码 hash——机器人账号不可通过正常登录使用
    const password_hash = await bcrypt.hash(generateId() + generateId(), 12);
    const id = generateId();

    await db('users').insert({
      id,
      uid,
      phone: null,         // 机器人无手机号
      password_hash,
      nickname,
      avatar_url,
      user_type: JSON.stringify(['player']),
      creator_level: 1,
      coins: 0,
      subscription_type: 'free',
      is_bot: 1,
      bot_status: 'active',
      bot_label: label,
    });

    return this.getBotById(id) as Promise<BotAccount>;
  }

  async getBotById(id: string): Promise<BotAccount | null> {
    const row = await db('users').where({ id, is_bot: 1 }).first();
    if (!row) return null;
    return rowToBot(row as Record<string, unknown>);
  }

  async getBotByUid(uid: number): Promise<BotAccount | null> {
    const row = await db('users').where({ uid, is_bot: 1 }).first();
    if (!row) return null;
    return rowToBot(row as Record<string, unknown>);
  }

  async getBots(status?: 'active' | 'hibernated'): Promise<BotAccount[]> {
    let q = db('users').where({ is_bot: 1 });
    if (status) q = q.where({ bot_status: status });
    const rows = await q.orderBy('uid', 'asc').select('*');
    return (rows as Record<string, unknown>[]).map(rowToBot);
  }

  async getActiveBots(): Promise<BotAccount[]> {
    return this.getBots('active');
  }

  /** 激活机器人账号（可发帖、互动） */
  async activateBot(botId: string): Promise<void> {
    const bot = await this.getBotById(botId);
    if (!bot) throw new Error(`机器人账号 ${botId} 不存在`);
    await db('users').where({ id: botId, is_bot: 1 }).update({ bot_status: 'active' });
  }

  /** 休眠机器人账号（停止一切活动，保留内容） */
  async hibernateBot(botId: string): Promise<void> {
    const bot = await this.getBotById(botId);
    if (!bot) throw new Error(`机器人账号 ${botId} 不存在`);
    await db('users').where({ id: botId, is_bot: 1 }).update({ bot_status: 'hibernated' });
  }

  /** 休眠所有活跃机器人（上线前清理用） */
  async hibernateAll(): Promise<number> {
    return db('users')
      .where({ is_bot: 1, bot_status: 'active' })
      .update({ bot_status: 'hibernated' });
  }

  /**
   * 转运营：移除机器人标记，账号变为普通创作者账号。
   * 该操作不可逆（is_bot = 0，bot_status = null）。
   */
  async transferToOps(botId: string): Promise<void> {
    const bot = await this.getBotById(botId);
    if (!bot) throw new Error(`机器人账号 ${botId} 不存在`);
    await db('users').where({ id: botId }).update({
      is_bot: 0,
      bot_status: null,
      bot_label: null,
    });
  }

  /** 统计各类机器人生成内容数量 */
  async getGeneratedContentStats(): Promise<{
    threads: number;
    posts: number;
  }> {
    const [threadRow, postRow] = await Promise.all([
      db('forum_threads').where({ is_bot_generated: 1 }).count('id as count').first(),
      db('forum_posts').where({ is_bot_generated: 1 }).count('id as count').first(),
    ]);
    return {
      threads: Number((threadRow as Record<string, unknown> | undefined)?.['count'] ?? 0),
      posts: Number((postRow as Record<string, unknown> | undefined)?.['count'] ?? 0),
    };
  }
}

export const botService = new BotService();
