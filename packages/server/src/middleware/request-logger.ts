/**
 * 请求日志中间件（结构化日志）
 *
 * 记录每条 HTTP 请求的：method / path / status / duration_ms
 * 规则：
 * - 2xx/3xx  INFO  级别（仅慢请求 > SLOW_MS 时输出）
 * - 4xx      WARN  级别（始终输出）
 * - 5xx      ERROR 级别（始终输出）
 * - /api/health 端点跳过（避免监控探针刷日志）
 *
 * 生产环境下输出 JSON，方便日志采集（Loki / ELK）。
 */
import type { Request, Response, NextFunction } from 'express';

/** 超过此阈值视为慢请求（ms） */
const SLOW_MS = 2_000;

/** 是否生产环境（输出 JSON 日志） */
const isProd = process.env.NODE_ENV === 'production';

function logLine(level: 'INFO' | 'WARN' | 'ERROR', data: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  if (isProd) {
    console.log(JSON.stringify({ ts, level, ...data }));
  } else {
    const { method, path, status, duration_ms, ip } = data;
    const flag = duration_ms && Number(duration_ms) > SLOW_MS ? ' [SLOW]' : '';
    const line = `[${ts}] ${level} ${method} ${path} ${status} ${duration_ms}ms${flag} (${ip})`;
    if (level === 'ERROR') console.error(line);
    else if (level === 'WARN') console.warn(line);
    else console.log(line);
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // 跳过健康探针
  if (req.path === '/api/health' || req.path === '/health') {
    next();
    return;
  }

  const start = Date.now();
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket?.remoteAddress ?? '-';

  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    const status = res.statusCode;
    // request_id 由 requestIdMiddleware 注入（需在本中间件之前注册）
    const request_id = req.requestId;
    const data: Record<string, unknown> = { method: req.method, path: req.path, status, duration_ms, ip };
    if (request_id) data.request_id = request_id;

    if (status >= 500) {
      logLine('ERROR', data);
    } else if (status >= 400) {
      logLine('WARN', data);
    } else if (duration_ms > SLOW_MS) {
      logLine('INFO', { ...data, slow: true });
    } else if (process.env.LOG_ALL_REQUESTS === '1') {
      logLine('INFO', data);
    }
  });

  next();
}
