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
 * Express 全局错误处理中间件类型兼容的错误响应工厂
 */
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './app-error';

export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 业务错误：直接返回 userMessage，不泄露内部信息
  if (err instanceof AppError) {
    if (err.internalMessage) {
      console.error(`[AppError] ${req.method} ${req.path} → ${err.internalMessage}`);
    }
    res.status(err.statusCode).json({ error: err.userMessage });
    return;
  }

  const message = safeErrorMessage(err, '服务器内部错误');
  const status = (err as Record<string, unknown>)?.['status'];
  const code = typeof status === 'number' ? status : 500;

  if (code >= 500) {
    console.error('[Unhandled Error]', err);
  }

  res.status(code).json({ error: message });
}
