/**
 * 日志脱敏工具
 *
 * 在结构化日志写出前，移除或遮蔽以下 PII / 安全敏感信息：
 *   - 手机号（11 位，或带 +86 前缀）
 *   - 中国大陆身份证号（18 位）
 *   - 电子邮件地址
 *   - IPv4 地址
 *   - JWT / Bearer Token
 *   - 数据库连接串（含密码）
 *   - 密码字段（password / password_hash / passwd）
 *
 * 用法：
 *   import { sanitizeLog } from '../middleware/log-sanitizer';
 *   const safeCtx = sanitizeLog(context);  // 在 logInfo/logWarn/logError 中调用
 */

interface PatternRule {
  regex: RegExp;
  replacement: string;
}

const SENSITIVE_PATTERNS: PatternRule[] = [
  // 中国手机号（1[3-9]xxxxxxxxx，含 +86 前缀）
  { regex: /(\+?86)?1[3-9]\d{9}/g, replacement: '***手机号***' },
  // 中国大陆身份证（18 位，末位可为 X/x）
  { regex: /\d{17}[\dXx]/g, replacement: '*****身份证*****' },
  // 电子邮件
  { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, replacement: '***邮箱***' },
  // IPv4（宽松匹配，避免与版本号冲突：要求前后非数字）
  { regex: /(?<!\d)(\d{1,3}\.){3}\d{1,3}(?!\d)/g, replacement: '***.***.***.***' },
  // JWT：三段 Base64Url，以 eyJ 开头
  { regex: /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]*/g, replacement: '[JWT_REDACTED]' },
  // Bearer Token
  { regex: /Bearer\s+[A-Za-z0-9\-_\.]+/gi, replacement: 'Bearer [REDACTED]' },
  // 数据库连接串（含密码部分：://user:password@）
  { regex: /:\/\/[^:@\s]+:[^@\s]+@/g, replacement: '://***:***@' },
];

/** 对象键中出现以下词汇时，整个值替换为 [REDACTED]（防止 JSON 序列化后暴露） */
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwd',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'phone',
  'id_card',
  'id_number',
]);

/**
 * 深度脱敏一个任意对象（不修改原对象，返回新副本）
 */
export function sanitizeLog(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    return applyPatterns(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeLog);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        result[k] = '[REDACTED]';
      } else {
        result[k] = sanitizeLog(v);
      }
    }
    return result;
  }

  return obj;
}

/**
 * 对字符串应用全部正则替换规则
 */
function applyPatterns(str: string): string {
  let result = str;
  for (const { regex, replacement } of SENSITIVE_PATTERNS) {
    // 重置 lastIndex 防止全局正则在循环中跳过匹配
    regex.lastIndex = 0;
    result = result.replace(regex, replacement);
  }
  return result;
}
