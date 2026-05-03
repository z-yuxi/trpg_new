/**
 * 内容举报
 * 产品设计依据：附录 N01：法律合规与内容安全
 *
 * 服务端接口：
 *   POST /reports  { content_type, content_id, reason }
 */
import { api } from '../utils/api';

function key(): string { return crypto.randomUUID(); }

export type ReportContentType = 'message' | 'post' | 'user' | 'module' | 'ruleset';

export function createReport(payload: {
  content_type: ReportContentType;
  content_id: string;
  reason: string;
}): Promise<{ id: string }> {
  return api.post('/reports', payload, key());
}
