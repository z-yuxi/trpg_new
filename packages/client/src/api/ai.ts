/**
 * AI 功能 API
 */
import { api } from '../utils/api';

export type AiTaskStatus = 'queued' | 'success' | 'failed';
export type AiTaskType = 'check_text' | 'import_module' | 'log_summary' | 'generate_recipe';

export interface AiTask {
  id: string;
  task_type: AiTaskType;
  status: AiTaskStatus;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  created_at: string;
}

export function getAiTasks(limit = 30): Promise<{ tasks: AiTask[] }> {
  return api.get(`/ai/tasks?limit=${limit}`);
}

export function getAiQuota(): Promise<{
  month: string;
  used: Partial<Record<AiTaskType, number>>;
  limits: Partial<Record<AiTaskType, number>>;
}> {
  return api.get('/ai/quota');
}
