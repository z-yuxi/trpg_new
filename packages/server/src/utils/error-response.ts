/**
 * 安全地提取错误信息，生产环境下避免泄露内部细节
 */
export function safeErrorMessage(err: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== 'production' && err instanceof Error) {
    return err.message;
  }
  return fallback;
}

/**
 * Express 全局错误处理中间件
 *
 * 统一响应格式：
 *   成功: 各路由自行返回 JSON
 *   业务错误: { error: string, error_code?: string }
 *   系统错误: { error: string }
 */
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './app-error';
import { logError } from './structured-logger';

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 业务错误：直接返回 userMessage，不泄露内部信息
  if (err instanceof AppError) {
    if (err.internalMessage) {
      logError('APP_ERROR', 'medium', err.internalMessage, { method: req.method, path: req.path });
    }
    const body: Record<string, unknown> = { error: err.userMessage };
    if (err.code) body['error_code'] = err.code;
    res.status(err.statusCode).json(body);
    return;
  }

  const message = safeErrorMessage(err, '服务器内部错误');
  const status = (err as Record<string, unknown>)?.['status'];
  const code = typeof status === 'number' ? status : 500;

  if (code >= 500) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logError('UNHANDLED_ERROR', 'critical', errMsg, { method: req.method, path: req.path });
  }

  res.status(code).json({ error: message });
}

/**
 * 快捷辅助：在路由中发送标准错误响应。
 * 不走全局中间件，适合路由内部 try/catch 时内联返回。
 */
export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  error_code?: string,
): void {
  const body: Record<string, unknown> = { error: message };
  if (error_code) body['error_code'] = error_code;
  res.status(statusCode).json(body);
}
