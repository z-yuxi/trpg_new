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

export function globalErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message = safeErrorMessage(err, '服务器内部错误');
  const status = (err as Record<string, unknown>)?.['status'];
  const code = typeof status === 'number' ? status : 500;

  if (code >= 500) {
    console.error('[Unhandled Error]', err);
  }

  res.status(code).json({ error: message });
}
