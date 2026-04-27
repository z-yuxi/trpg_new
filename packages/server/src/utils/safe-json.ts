/**
 * 安全的 JSON 解析工具函数。
 * 解析失败时返回提供的默认值，而非抛出异常导致服务崩溃。
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value as unknown as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    console.error(`[safeJsonParse] Failed to parse JSON: ${String(value).slice(0, 100)}`);
    return fallback;
  }
}
