/**
 * Interactor — 机器人社区互动服务
 *
 * 职责：
 * 1. likeThread   — 给主帖点赞（like_count +1，防重复记录）
 * 2. replyToThread — 回复主帖（通过 Publisher.publishPost）
 * 3. reactRandom  — 随机选取近期帖子并执行互动（批量操作入口）
 *
 * 防重复机制：
 * - 维护 bot_interactions 内存集合（运行期去重）
 * - 生产环境建议迁移到 Redis SET 做持久化去重
 *
 * 注意：举报功能不在此实现——机器人不应发起任何举报行为。
 */
import { db } from '../db';
import { botService } from './bot-service';
import { publisher } from './publisher';
import { seedGenerator } from './seed-generator';
import { logError } from '../utils/structured-logger';

/** 内存级互动去重 Set（key = `${botId}:like:${threadId}`） */
const interactionMemory = new Set<string>();

export class Interactor {
  /**
   * 给指定帖子点赞。
   * - 同一机器人对同一帖子只点赞一次（内存去重）
   * - 直接 increment like_count，无需登录态
   */
  async likeThread(params: {
    botId: string;
    threadId: string;
  }): Promise<{ liked: boolean }> {
    const { botId, threadId } = params;

    const key = `${botId}:like:${threadId}`;
    if (interactionMemory.has(key)) {
      return { liked: false };
    }

    const bot = await botService.getBotById(botId);
    if (!bot || bot.bot_status !== 'active') return { liked: false };

    const thread = await db('forum_threads').where({ id: threadId }).first();
    if (!thread) return { liked: false };

    await db('forum_threads').where({ id: threadId }).increment('like_count', 1);
    interactionMemory.add(key);
    return { liked: true };
  }

  /**
   * 以机器人身份回复主帖。
   * 使用 SeedGenerator 生成回复内容，Publisher 创建楼层。
   */
  async replyToThread(params: {
    botId: string;
    threadId: string;
    useAi?: boolean;
  }): Promise<{ postId: string | null }> {
    const { botId, threadId, useAi = true } = params;

    const bot = await botService.getBotById(botId);
    if (!bot || bot.bot_status !== 'active') return { postId: null };

    const replyKey = `${botId}:reply:${threadId}`;
    if (interactionMemory.has(replyKey)) {
      return { postId: null };
    }

    // 获取帖子标题+内容以生成针对性回复
    const threadRow = await db('forum_threads').where({ id: threadId }).first() as
      Record<string, unknown> | undefined;
    if (!threadRow) return { postId: null };

    const content = await seedGenerator.generateReply({
      threadTitle: threadRow['title'] as string,
      threadContent: threadRow['content'] as string,
      useAi,
    });

    try {
      const { postId } = await publisher.publishPost({ botId, threadId, content });
      interactionMemory.add(replyKey);
      return { postId };
    } catch (err) {
      logError('BOT_INTERACTOR_REPLY_FAILED', 'medium', (err as Error).message);
      return { postId: null };
    }
  }

  /**
   * 随机互动：从最近帖子中挑选，执行点赞 + 回复。
   * 用于 Phase 3 批量执行入口。
   *
   * @param botIds        参与互动的机器人 ID 列表
   * @param limit         从最近 N 条帖子中选取（default 20）
   * @param likeRatio     点赞概率 0–1（default 0.6）
   * @param replyRatio    回复概率 0–1（default 0.3）
   * @param useAi         是否使用 AI 生成回复内容
   */
  async reactRandom(params: {
    botIds: string[];
    limit?: number;
    likeRatio?: number;
    replyRatio?: number;
    useAi?: boolean;
  }): Promise<{ likes: number; replies: number }> {
    const {
      botIds,
      limit = 20,
      likeRatio = 0.6,
      replyRatio = 0.3,
      useAi = true,
    } = params;

    // 取最近的非机器人生成帖子（真实用户内容优先）
    const threads = await db('forum_threads')
      .where({ is_locked: false })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .select('id', 'title', 'content');

    let likes = 0;
    let replies = 0;

    for (const thread of threads as Record<string, unknown>[]) {
      const threadId = thread['id'] as string;

      for (const botId of botIds) {
        if (Math.random() < likeRatio) {
          const result = await this.likeThread({ botId, threadId });
          if (result.liked) likes++;
        }

        if (Math.random() < replyRatio) {
          const result = await this.replyToThread({ botId, threadId, useAi });
          if (result.postId) replies++;
        }
      }
    }

    return { likes, replies };
  }

  /** 清除内存去重集合（测试用 / 重启后自动清除） */
  clearInteractionMemory(): void {
    interactionMemory.clear();
  }

  /** 查看当前去重记录数量 */
  getInteractionCount(): number {
    return interactionMemory.size;
  }
}

export const interactor = new Interactor();
