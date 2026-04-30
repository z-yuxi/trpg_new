/**
 * Request-ID 中间件
 *
 * 为每条请求生成唯一 X-Request-Id，并透传到响应头。
 * 下游日志、审计日志、错误日志均读取 req.requestId 以便全链路关联。
 *
 * 优先使用客户端传入的 X-Request-Id（允许客户端追踪）：
 *   - 有效格式：字母数字/连字符/下划线，4–64 字符
 *   - 格式非法或缺失时服务端自动生成 hex-16
 */
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const VALID_RE = /^[a-zA-Z0-9\-_]{4,64}$/;

// 通过全局 Express namespace 扩展（与 auth.ts 保持相同方式）
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && VALID_RE.test(incoming)
      ? incoming
      : crypto.randomBytes(8).toString('hex');

  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
