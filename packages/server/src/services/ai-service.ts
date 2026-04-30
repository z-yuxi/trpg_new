/**
 * AI 服务：DeepSeek 客户端
 *
 * 职责：
 * 1. 调用 DeepSeek /chat/completions 端点
 * 2. 失败自动重试（间隔 3s / 9s，共 2 次）
 * 3. 记录调用日志到 ai_usage_log（失败不消耗配额）
 *
 * 配置（环境变量）：
 *   DEEPSEEK_API_KEY       — 必填
 *   DEEPSEEK_BASE_URL      — 默认 https://api.deepseek.com/v1
 *   DEEPSEEK_PRO_MODEL     — 默认 deepseek-chat
 *   DEEPSEEK_FLASH_MODEL   — 默认 deepseek-chat
 */
import { generateId } from '@trpg/shared';
import { db } from '../db';

export type TaskType = 'import_module' | 'check_text' | 'log_summary' | 'generate_recipe';
export type AiEndpoint = 'pro' | 'flash';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const AI_CONFIG = {
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  endpoints: {
    pro: {
      model: process.env.DEEPSEEK_PRO_MODEL ?? 'deepseek-chat',
      maxTokens: 16384,
      temperature: 0.3,
    },
    flash: {
      model: process.env.DEEPSEEK_FLASH_MODEL ?? 'deepseek-chat',
      maxTokens: 4096,
      temperature: 0.1,
    },
  },
} as const;

// 重试延迟：3s, 9s（共 2 次重试）
const RETRY_DELAYS_MS = [3_000, 9_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDeepSeek(
  endpoint: AiEndpoint,
  messages: AiMessage[],
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const cfg = AI_CONFIG.endpoints[endpoint];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const resp = await fetch(`${AI_CONFIG.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${AI_CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          max_tokens: cfg.maxTokens,
          temperature: cfg.temperature,
        }),
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`DeepSeek HTTP ${resp.status}: ${body}`);
      }

      const data = (await resp.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      return {
        content: data.choices[0]?.message.content ?? '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      lastError = err as Error;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) {
        console.warn(`[AI] 第 ${attempt + 1} 次调用失败，${delay / 1000}s 后重试:`, lastError.message);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('AI 请求失败');
}

/**
 * 调用 AI 并记录日志。
 * 成功才在日志中标记 success；失败标记 failed，不消耗用户配额。
 */
export async function callAI(
  endpoint: AiEndpoint,
  messages: AiMessage[],
  taskType: TaskType,
  userId: string,
): Promise<string> {
  const logId = generateId();
  const start = Date.now();

  await db('ai_usage_log').insert({
    id: logId,
    user_id: userId,
    task_type: taskType,
    endpoint,
    status: 'queued',
    input_tokens: 0,
    output_tokens: 0,
    cost_cents: 0,
    duration_ms: 0,
  });

  try {
    const { content, inputTokens, outputTokens } = await fetchDeepSeek(endpoint, messages);

    await db('ai_usage_log').where({ id: logId }).update({
      status: 'success',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: Date.now() - start,
    });

    return content;
  } catch (err) {
    await db('ai_usage_log').where({ id: logId }).update({
      status: 'failed',
      duration_ms: Date.now() - start,
    });
    throw err;
  }
}
