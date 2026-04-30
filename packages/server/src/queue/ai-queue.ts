/**
 * AI 异步任务队列（BullMQ）
 *
 * 职责：
 * 1. 导出 aiQueue（生产者端，路由层调用）
 * 2. 导出 startAiWorker(io)（消费者端，server.ts 启动时调用一次）
 * 3. 任务完成/失败后通过 Socket.IO 推送 ai_task_update 事件给对应用户
 *
 * 注意：BullMQ 要求独立的 IORedis 连接（maxRetriesPerRequest: null）
 */
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { Server } from 'socket.io';
import { generateId } from '@trpg/shared';
import { callAI, type TaskType, type AiEndpoint, type AiMessage } from '../services/ai-service';

export interface AiJobData {
  taskId: string;
  userId: string;
  taskType: TaskType;
  endpoint: AiEndpoint;
  messages: AiMessage[];
}

/** 创建 BullMQ 专用 Redis 连接（不能共享主客户端） */
function createBullMQConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT) ?? 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB) ?? 0,
    // BullMQ 要求此项为 null，否则会抛 MaxRetriesPerRequestError
    maxRetriesPerRequest: null,
  });
}

const queueConnection = createBullMQConnection();

export const aiQueue = new Queue<AiJobData>('ai-tasks', { connection: queueConnection });

/**
 * 启动 BullMQ Worker。
 * 在 server.ts 中调用，传入已初始化的 Socket.IO Server 实例。
 */
export function startAiWorker(io: Server): Worker<AiJobData> {
  const workerConnection = createBullMQConnection();

  const worker = new Worker<AiJobData>(
    'ai-tasks',
    async (job) => {
      const { taskId, userId, taskType, endpoint, messages } = job.data;

      try {
        const result = await callAI(endpoint, messages, taskType, userId);

        io.to(`user:${userId}`).emit('ai_task_update', {
          task_id: taskId,
          status: 'success',
          result,
        });

        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'AI 任务失败';

        io.to(`user:${userId}`).emit('ai_task_update', {
          task_id: taskId,
          status: 'failed',
          error: message,
        });

        // 重新抛出以让 BullMQ 记录失败状态
        throw err;
      }
    },
    { connection: workerConnection },
  );

  worker.on('error', (err) => {
    console.error('[AI Worker] 错误:', err);
  });

  console.log('[AI Worker] 已启动，监听 ai-tasks 队列');
  return worker;
}

/**
 * 将 AI 任务加入队列，返回 taskId。
 */
export async function enqueueAiTask(
  data: Omit<AiJobData, 'taskId'>,
): Promise<string> {
  const taskId = generateId();
  await aiQueue.add('ai-task', { ...data, taskId });
  return taskId;
}
