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
import {
  extractJsonFromAiOutput,
  validateImportModuleOutput,
} from '../services/ai-output-validator';
import { logError, logInfo, logWarn } from '../utils/structured-logger';

export interface AiJobData {
  taskId: string;
  userId: string;
  taskType: TaskType;
  endpoint: AiEndpoint;
  messages: AiMessage[];
  /**
   * 多分片模式（import_module 专用）。
   * 存在时，Worker 按序逐片调用 AI，携带 prev_summary 上下文，
   * 最终将所有分片实体合并去重后一次性推送结果。
   */
  chunks?: {
    texts: string[];
    term_whitelist: string[];
  };
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** 创建 BullMQ 专用 Redis 连接（不能共享主客户端） */
function createBullMQConnection(): IORedis {
  return new IORedis({
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: envInt('REDIS_PORT', 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: envInt('REDIS_DB', 0),
    // BullMQ 要求此项为 null，否则会抛 MaxRetriesPerRequestError
    maxRetriesPerRequest: null,
  });
}

let aiQueue: Queue<AiJobData> | null = null;

function getAiQueue(): Queue<AiJobData> {
  if (!aiQueue) {
    const queueConnection = createBullMQConnection();
    aiQueue = new Queue<AiJobData>('ai-tasks', { connection: queueConnection });
  }
  return aiQueue;
}

/**
 * 构建单片 import_module 所需的 messages。
 */
function buildImportChunkMessages(
  text: string,
  prevSummary: string,
  termWhitelist: string[],
): AiMessage[] {
  const prevCtx = prevSummary ? `\n\n上一片段已识别实体摘要：${prevSummary}` : '';
  const termsCtx = termWhitelist.length
    ? `\n\n专属术语（保留原文，不可改写）：${termWhitelist.join('、')}`
    : '';
  return [
    {
      role: 'system',
      content:
        `你是 TRPG 模组结构分析助手。从文本片段中提取结构化实体。` +
        `返回严格 JSON（无 Markdown 包裹）：` +
        `{"entities":[{"type":"npc"|"scene"|"clue"|"item"|"event","name":"名称","description":"简短描述（50字内）","mentions":["相关文本引用"]}]}` +
        `。${prevCtx}${termsCtx}`,
    },
    { role: 'user', content: text },
  ];
}

interface EntityRecord {
  type: string;
  name: string;
  description: string;
  mentions: string[];
}

/**
 * 按 type:name（小写）合并多分片实体，同名实体合并 mentions，去重。
 */
function mergeEntityBatches(batches: EntityRecord[][]): EntityRecord[] {
  const seen = new Map<string, EntityRecord>();
  for (const batch of batches) {
    for (const e of batch) {
      if (!e.name) continue;
      const key = `${e.type}:${e.name.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.set(key, { ...e, mentions: [...(e.mentions ?? [])] });
      } else {
        const existing = seen.get(key)!;
        const unified = new Set([...existing.mentions, ...(e.mentions ?? [])]);
        existing.mentions = [...unified].slice(0, 20);
      }
    }
  }
  return [...seen.values()];
}

/**
 * 生成前一片实体的精简摘要（名称+类型，≤600 字），供下一片提示词使用。
 */
function makePrevSummary(entities: EntityRecord[]): string {
  return entities
    .slice(0, 30)
    .map((e) => `${e.name}(${e.type})`)
    .join('、')
    .slice(0, 600);
}

/**
 * 按序处理多个文本分片，逐片 AI 识别，最后合并去重后返回 JSON 字符串。
 */
async function processMultiChunks(
  texts: string[],
  termWhitelist: string[],
  endpoint: AiEndpoint,
  taskType: TaskType,
  userId: string,
): Promise<string> {
  const allBatches: EntityRecord[][] = [];
  let prevSummary = '';

  for (const text of texts) {
    const msgs = buildImportChunkMessages(text, prevSummary, termWhitelist);
    let raw: string;
    try {
      raw = await callAI(endpoint, msgs, taskType, userId);
    } catch {
      // 单片失败不终止整个任务，跳过本片
      continue;
    }
    let entities: EntityRecord[] = [];
    try {
      const parsed = extractJsonFromAiOutput(raw);
      const validated = validateImportModuleOutput(parsed);
      entities = validated.entities as EntityRecord[];
    } catch {
      // 校验失败跳过本片
      continue;
    }
    if (entities.length > 0) {
      allBatches.push(entities);
      prevSummary = makePrevSummary(entities);
    }
  }

  const merged = mergeEntityBatches(allBatches);
  return JSON.stringify({ entities: merged });
}

/**
 * 启动 BullMQ Worker。
 * 在 server.ts 中调用，传入已初始化的 Socket.IO Server 实例。
 */
export function startAiWorker(io: Server): Worker<AiJobData> {
  const workerConnection = createBullMQConnection();

  const worker = new Worker<AiJobData>(
    'ai-tasks',
    async (job) => {
      const { taskId, userId, taskType, endpoint, messages, chunks } = job.data;

      try {
        // ── 多分片模式（import_module 专用） ─────────────────────────────
        if (taskType === 'import_module' && chunks && chunks.texts.length > 0) {
          const safeResult = await processMultiChunks(chunks.texts, chunks.term_whitelist, endpoint, taskType, userId);
          io.of('/user').to(`user:${userId}`).emit('ai_task_update', {
            task_id: taskId,
            status: 'success',
            result: safeResult,
          });
          return safeResult;
        }

        // ── 单片模式（通用路径） ──────────────────────────────────────────
        const rawResult = await callAI(endpoint, messages, taskType, userId);

        // 对 import_module 任务进行输出校验，确保结构和术语安全
        let safeResult: string = rawResult;
        if (taskType === 'import_module') {
          try {
            const parsed = extractJsonFromAiOutput(rawResult);
            const validated = validateImportModuleOutput(parsed);
            safeResult = JSON.stringify(validated);
          } catch (validationErr) {
            logWarn('AI_WORKER_IMPORT_MODULE_VALIDATION_FAILED', '输出校验失败，使用原始结果', { error: validationErr instanceof Error ? validationErr.message : String(validationErr) });
          }
        }

        io.of('/user').to(`user:${userId}`).emit('ai_task_update', {
          task_id: taskId,
          status: 'success',
          result: safeResult,
        });

        return safeResult;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'AI 任务失败';

        io.of('/user').to(`user:${userId}`).emit('ai_task_update', {
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
    logError('AI_WORKER_ERROR', 'high', err instanceof Error ? err.message : String(err));
  });

  logInfo('AI_WORKER_STARTED', '已启动，监听 ai-tasks 队列');
  return worker;
}

/**
 * 将 AI 任务加入队列，返回 taskId。
 */
export async function enqueueAiTask(
  data: Omit<AiJobData, 'taskId'>,
): Promise<string> {
  const taskId = generateId();
  await getAiQueue().add('ai-task', { ...data, taskId }, { jobId: taskId });
  return taskId;
}

/**
 * 暴露队列实例，供重试端点使用。
 */
export function getAiQueueInstance(): Queue<AiJobData> {
  return getAiQueue();
}
