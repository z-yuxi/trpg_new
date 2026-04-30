/**
 * 内容举报
 * 产品设计依据：附录 N01：法律合规与内容安全
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export type ReportTargetType = 'message' | 'post' | 'module' | 'ruleset' | 'user' | 'comment';

export function createReport(payload: {
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  detail?: string;
}): Promise<{ id: string }> {
  return api.post('/reports', payload, key());
}
