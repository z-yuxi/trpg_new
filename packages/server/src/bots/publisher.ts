/**
 * Publisher — 以机器人身份发布论坛帖子
 *
 * 职责：
 * 1. publishThread — 创建主帖，标记 is_bot_generated=1
 * 2. publishPost   — 创建回复楼层，标记 is_bot_generated=1
 * 3. 返回创建的 post_id / thread_id（供 Interactor 使用）
 *
 * 使用 forumService 处理核心逻辑（楼层号管理、浏览数等），
 * 发布后通过额外 UPDATE 打上 is_bot_generated 标记。
 */
import { forumService, type ForumBoard, type ForumThread, type ForumPost } from '../services/forum-service';
import { botService } from './bot-service';
import { contentQualityFilter } from './content-quality-filter';
import { db } from '../db';

export interface PublishThreadResult {
  thread: ForumThread;
  threadId: string;
}

export interface PublishPostResult {
  post: ForumPost;
  postId: string;
}

export class Publisher {
  /**
   * 以机器人身份发布一个新主帖。
   * @param botId    机器人用户 ID
   * @param board    目标板块
   * @param title    帖子标题
   * @param content  帖子正文
   */
  async publishThread(params: {
    botId: string;
    board: ForumBoard;
    title: string;
    content: string;
  }): Promise<PublishThreadResult> {
    const { botId, board, title, content } = params;

    // 验证机器人存在且处于激活状态
    const bot = await botService.getBotById(botId);
    if (!bot) throw new Error(`机器人账号 ${botId} 不存在`);
    if (bot.bot_status !== 'active') throw new Error(`机器人 ${bot.nickname} 处于休眠状态`);

    // 质量过滤：敏感词 / 过短 / 重复率
    const quality = await contentQualityFilter.check({ title, content });
    if (!quality.passed) {
      throw new Error(`内容质量未通过 [${quality.reason}]: ${quality.detail}`);
    }

    const thread = await forumService.createThread({
      board,
      author_id: botId,
      title,
      content,
    });

    // 打上机器人生成标记
    await db('forum_threads').where({ id: thread.id }).update({ is_bot_generated: 1 });

    return { thread, threadId: thread.id };
  }

  /**
   * 以机器人身份在指定主帖下发布回复。
   */
  async publishPost(params: {
    botId: string;
    threadId: string;
    content: string;
    replyToPostId?: string;
  }): Promise<PublishPostResult> {
    const { botId, threadId, content, replyToPostId } = params;

    const bot = await botService.getBotById(botId);
    if (!bot) throw new Error(`机器人账号 ${botId} 不存在`);
    if (bot.bot_status !== 'active') throw new Error(`机器人 ${bot.nickname} 处于休眠状态`);

    const post = await forumService.createPost({
      thread_id: threadId,
      author_id: botId,
      content,
      reply_to_post_id: replyToPostId,
    });

    // 打上机器人生成标记
    await db('forum_posts').where({ id: post.id }).update({ is_bot_generated: 1 });

    return { post, postId: post.id };
  }

  /**
   * 批量发布：给多个主帖各自追加一条机器人回复。
   * 用于 Phase 3 自动互动。
   */
  async publishRepliesForThreads(params: {
    botId: string;
    threadIds: string[];
    contentGenerator: (threadId: string) => Promise<string>;
  }): Promise<PublishPostResult[]> {
    const results: PublishPostResult[] = [];

    for (const threadId of params.threadIds) {
      try {
        const content = await params.contentGenerator(threadId);
        const result = await this.publishPost({
          botId: params.botId,
          threadId,
          content,
        });
        results.push(result);
      } catch (err) {
        console.error(`[Publisher] 发布回复失败 threadId=${threadId}:`, (err as Error).message);
      }
    }

    return results;
  }
}

export const publisher = new Publisher();
