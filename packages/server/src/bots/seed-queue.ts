/**
 * SeedQueue — BullMQ 种子任务队列
 *
 * 职责：
 * 1. 将长流程种子任务（发帖、互动、清理）入队异步处理
 * 2. Worker 消费任务并执行对应操作
 * 3. 提供任务状态查询接口
 *
 * 任务类型：
 *   seed_thread   — 生成并发布一篇新帖子
 *   seed_interact — 对现有帖子执行点赞 / 回复
 *   seed_cleanup  — 休眠所有机器人 + 统计生成内容
 *
 * 队列名：seed-tasks（与 ai-tasks 隔离）
 * BullMQ 需要独立的 IORedis 连接（maxRetriesPerRequest: null）
 */
import { Queue, Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { botService } from './bot-service';
import { seedGenerator } from './seed-generator';
import { publisher } from './publisher';
import { interactor } from './interactor';
import type { BoardType } from './prompts';

// ─────────────────────────────────────────────────────────
// Job 数据类型
// ─────────────────────────────────────────────────────────
export type SeedJobType = 'seed_thread' | 'seed_interact' | 'seed_cleanup';

export interface SeedThreadJobData {
  type: 'seed_thread';
  botId: string;
  board?: BoardType;
  useAi?: boolean;
}

export interface SeedInteractJobData {
  type: 'seed_interact';
  botIds: string[];
  limit?: number;
  likeRatio?: number;
  replyRatio?: number;
  useAi?: boolean;
}

export interface SeedCleanupJobData {
  type: 'seed_cleanup';
}

export type SeedJobData = SeedThreadJobData | SeedInteractJobData | SeedCleanupJobData;

// ─────────────────────────────────────────────────────────
// Redis 连接工厂
// ─────────────────────────────────────────────────────────
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function createBullMQConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: envInt('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: envInt('REDIS_DB', 0),
    maxRetriesPerRequest: null,
  });
}

// ─────────────────────────────────────────────────────────
// 队列单例
// ─────────────────────────────────────────────────────────
let seedQueue: Queue<SeedJobData> | null = null;

function getSeedQueue(): Queue<SeedJobData> {
  if (!seedQueue) {
    seedQueue = new Queue<SeedJobData>('seed-tasks', {
      connection: createBullMQConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return seedQueue;
}

// ─────────────────────────────────────────────────────────
// 入队函数
// ─────────────────────────────────────────────────────────
/** 入队：生成并发布一篇帖子 */
export async function enqueueSeedThread(data: Omit<SeedThreadJobData, 'type'>): Promise<string> {
  const job = await getSeedQueue().add('seed_thread', { type: 'seed_thread', ...data });
  return job.id ?? '';
}

/** 入队：批量互动 */
export async function enqueueSeedInteract(data: Omit<SeedInteractJobData, 'type'>): Promise<string> {
  const job = await getSeedQueue().add('seed_interact', { type: 'seed_interact', ...data });
  return job.id ?? '';
}

/** 入队：清理（休眠机器人 + 统计） */
export async function enqueueSeedCleanup(): Promise<string> {
  const job = await getSeedQueue().add('seed_cleanup', { type: 'seed_cleanup' });
  return job.id ?? '';
}

// ─────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────
export function startSeedWorker(): Worker<SeedJobData> {
  const worker = new Worker<SeedJobData>(
    'seed-tasks',
    async (job: Job<SeedJobData>) => {
      const data = job.data;
      console.log(`[SeedWorker] 开始执行任务 ${job.id} type=${data.type}`);

      switch (data.type) {
        case 'seed_thread': {
          const bot = await botService.getBotById(data.botId);
          if (!bot) throw new Error(`机器人 ${data.botId} 不存在`);

          const post = await seedGenerator.generatePost({
            botLabel: bot.bot_label,
            board: data.board,
            useAi: data.useAi ?? true,
          });

          const result = await publisher.publishThread({
            botId: data.botId,
            board: post.board,
            title: post.title,
            content: post.content,
          });

          console.log(`[SeedWorker] 发帖成功 threadId=${result.threadId} bot=${bot.nickname}`);
          return { threadId: result.threadId };
        }

        case 'seed_interact': {
          const result = await interactor.reactRandom({
            botIds: data.botIds,
            limit: data.limit,
            likeRatio: data.likeRatio,
            replyRatio: data.replyRatio,
            useAi: data.useAi ?? true,
          });
          console.log(`[SeedWorker] 互动完成 likes=${result.likes} replies=${result.replies}`);
          return result;
        }

        case 'seed_cleanup': {
          const hibernated = await botService.hibernateAll();
          const stats = await botService.getGeneratedContentStats();
          console.log(`[SeedWorker] 清理完成 hibernated=${hibernated} threads=${stats.threads} posts=${stats.posts}`);
          return { hibernated, ...stats };
        }

        default: {
          const exhaustive: never = data;
          throw new Error(`未知任务类型: ${(exhaustive as SeedJobData).type}`);
        }
      }
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,  // 种子任务串行，避免并发发帖
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[SeedWorker] 任务失败 jobId=${job?.id ?? 'unknown'}:`, err.message);
  });

  return worker;
}

export { getSeedQueue };
