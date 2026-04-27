import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';

/**
 * 全局错误处理中间件。
 * - 生产环境：仅返回通用错误消息，敏感信息写入日志
 * - 开发环境：可返回详细信息辅助调试
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.userMessage });
    if (err.internalMessage) {
      console.error(`[AppError] ${req.method} ${req.path} → ${err.internalMessage}`);
    }
    return;
  }

  // 未知错误
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[UnhandledError] ${req.method} ${req.path} → ${message}`);

  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: isProd ? '服务器内部错误，请稍后再试' : message,
  });
}
