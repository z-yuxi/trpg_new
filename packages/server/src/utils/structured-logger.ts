/**
 * 结构化日志工具
 * 在生产环境中应对接 Winston、Pino 等日志库
 * 
 * 规范：
 * - 不直接输出完整的 Error 对象或堆栈
 * - 所有日志包含：code（错误码）、severity（严重级别）、msg（安全消息）、requestId（可选）
 * - 敏感信息（用户数据、SQL、tokens 等）不输出到日志
 */

import { sanitizeLog } from '../middleware/log-sanitizer';

export type LogSeverity = 'debug' | 'info' | 'warn' | 'medium' | 'high' | 'critical';

export interface StructuredLogEntry {
  code: string;
  severity: LogSeverity;
  msg?: string;
  context?: Record<string, unknown>;
  requestId?: string;
  userId?: string;
  timestamp?: string;
}

/**
 * 格式化日志条目为可读的字符串
 */
function formatLogEntry(entry: StructuredLogEntry): string {
  const ts = entry.timestamp || new Date().toISOString();
  const parts = [
    `[${ts}]`,
    `${entry.severity.toUpperCase()}`,
    entry.code,
  ];
  if (entry.msg) parts.push(`- ${entry.msg}`);
  if (entry.requestId) parts.push(`req=${entry.requestId}`);
  if (entry.userId) parts.push(`uid=${entry.userId}`);
  if (entry.context) {
    parts.push(JSON.stringify(sanitizeLog(entry.context)));
  }
  return parts.join(' ');
}

/**
 * 结构化日志 - 信息级别
 */
export function logInfo(code: string, msg?: string, context?: Record<string, unknown>, requestId?: string): void {
  const entry: StructuredLogEntry = { code, severity: 'info', msg, context, requestId };
  console.log(formatLogEntry(entry));
}

/**
 * 结构化日志 - 警告级别
 */
export function logWarn(code: string, msg?: string, context?: Record<string, unknown>, requestId?: string): void {
  const entry: StructuredLogEntry = { code, severity: 'warn', msg, context, requestId };
  console.warn(formatLogEntry(entry));
}

/**
 * 结构化日志 - 错误级别（一般业务错误）
 */
export function logError(code: string, severity: LogSeverity = 'medium', msg?: string, context?: Record<string, unknown>, requestId?: string): void {
  const entry: StructuredLogEntry = { code, severity, msg, context, requestId };
  console.error(formatLogEntry(entry));
}

/**
 * 从 Error 对象安全地提取消息
 */
export function extractSafeErrorInfo(err: unknown): { msg: string; code: string } {
  if (err instanceof Error) {
    return {
      msg: err.message.slice(0, 200), // 限制长度
      code: (err as any).code || 'INTERNAL_ERROR',
    };
  }
  return { msg: 'Unknown error', code: 'UNKNOWN_ERROR' };
}

/**
 * 路由错误处理标准模板
 * 用法：
 * catch (err: unknown) {
 *   const { statusCode, response } = handleRouteError(err, 'OPERATION_NAME');
 *   res.status(statusCode).json(response);
 * }
 */
export function handleRouteError(err: unknown, operationName: string, requestId?: string): {
  statusCode: number;
  response: { error: string };
} {
  const { msg, code } = extractSafeErrorInfo(err);

  if (err instanceof Error && 'statusCode' in err) {
    // AppError
    const appErr = err as any;
    logError(appErr.code || code, 'medium', msg, { operation: operationName }, requestId);
    return {
      statusCode: appErr.statusCode || 500,
      response: { error: appErr.userMessage || '操作失败' },
    };
  }

  // 通用错误
  logError(code, 'high', msg, { operation: operationName }, requestId);
  return {
    statusCode: 500,
    response: { error: '服务器错误，请稍后重试' },
  };
}
