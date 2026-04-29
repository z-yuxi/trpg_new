/**
 * 审计日志中间件
 *
 * 记录所有安全相关的关键操作，包括：
 * - 招募申请 / GM 审批 / 玩家确认 / 成团
 * - 用户登录 / 登出 / 注册
 * - 资源删除操作
 *
 * 日志格式（JSON）：
 * {
 *   ts: ISO8601,
 *   event: 'audit',
 *   action: 'RECRUITMENT_APPLY' | 'GM_REVIEW' | ...,
 *   userId?: string,        // 操作者（脱敏后的 ID）
 *   resourceId?: string,    // 被操作资源 ID
 *   ip: string,             // 脱敏 IP（仅保留前段，如 192.168.x.x）
 *   method: string,
 *   path: string,
 *   statusCode: number,
 *   ua: string,             // 脱敏 UA（仅前 80 字符）
 * }
 *
 * 注意：此中间件不记录完整请求体，避免敏感字段（密码、手机号等）泄露。
 */
import type { Request, Response, NextFunction } from 'express';

/** 审计操作类型映射（基于方法+路径前缀） */
const ACTION_PATTERNS: Array<{
  method: string;
  pathPattern: RegExp;
  action: string;
}> = [
  { method: 'POST', pathPattern: /^\/api\/auth\/login/, action: 'AUTH_LOGIN' },
  { method: 'POST', pathPattern: /^\/api\/auth\/register/, action: 'AUTH_REGISTER' },
  { method: 'POST', pathPattern: /^\/api\/auth\/logout/, action: 'AUTH_LOGOUT' },
  { method: 'POST', pathPattern: /\/recruitment\/[^/]+\/apply/, action: 'RECRUITMENT_APPLY' },
  { method: 'POST', pathPattern: /\/recruitment\/[^/]+\/publish/, action: 'RECRUITMENT_PUBLISH' },
  { method: 'POST', pathPattern: /\/recruitment\/[^/]+\/close/, action: 'RECRUITMENT_CLOSE' },
  { method: 'POST', pathPattern: /\/recruitment\/[^/]+\/dissolve/, action: 'RECRUITMENT_DISSOLVE' },
  { method: 'POST', pathPattern: /\/recruitment\/[^/]+\/group/, action: 'RECRUITMENT_GROUP' },
  { method: 'POST', pathPattern: /\/recruitment\/applications\/[^/]+\/confirm/, action: 'RECRUITMENT_CONFIRM' },
  { method: 'POST', pathPattern: /\/recruitment\/[^/]+\/applications\/[^/]+\/review/, action: 'GM_REVIEW' },
  { method: 'DELETE', pathPattern: /\/recruitment\//, action: 'RECRUITMENT_DELETE' },
  { method: 'DELETE', pathPattern: /\/campaigns\//, action: 'CAMPAIGN_DELETE' },
  { method: 'POST', pathPattern: /\/campaigns\//, action: 'CAMPAIGN_ACTION' },
];

/** 脱敏 IP：IPv4 掩去最后一段，IPv6 掩去后 3 组 */
function maskIp(ip: string): string {
  if (!ip || ip === '-') return '-';
  // IPv4
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.x.x`;
  // IPv6（简单处理）
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 3).join(':') + ':****';
  }
  return ip.slice(0, 6) + '***';
}

/** 截断 User-Agent 到 80 字符 */
function truncateUa(ua: string | undefined): string {
  if (!ua) return '-';
  return ua.length > 80 ? ua.slice(0, 80) + '…' : ua;
}

/** 从 JWT payload 提取 userId（不验证签名，仅用于日志） */
function extractUserIdFromToken(req: Request): string {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return '-';
    const payload = auth.split('.')[1];
    if (!payload) return '-';
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return String(decoded.userId ?? decoded.sub ?? '-');
  } catch {
    return '-';
  }
}

function getAction(method: string, path: string): string | null {
  for (const p of ACTION_PATTERNS) {
    if (p.method === method && p.pathPattern.test(path)) return p.action;
  }
  return null;
}

export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  const action = getAction(req.method, req.path);
  if (!action) {
    next();
    return;
  }

  const ip = maskIp(
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    '-',
  );
  const userId = extractUserIdFromToken(req);
  const ua = truncateUa(req.headers['user-agent']);

  // 记录在响应完成后（可获取 statusCode）
  res.on('finish', () => {
    const entry = {
      ts: new Date().toISOString(),
      event: 'audit',
      action,
      userId,
      ip,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      ua,
    };
    // 始终输出审计日志（不受 LOG_ALL_REQUESTS 环境变量控制）
    console.log(JSON.stringify(entry));
  });

  next();
}
