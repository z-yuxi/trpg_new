/**
 * 集中式限流配置
 *
 * 策略说明：
 *   globalApiLimiter     所有 /api/* 路由的基础防护（IP 维度）
 *                        100 req/min per IP，针对爬虫/扫描器
 *
 *   paymentCreateLimiter 创建订单：10 req/min per IP
 *                        防止脚本循环创建订单消耗数据库
 *
 *   paymentWebhookLimiter 支付回调：120 req/min per IP
 *                        渠道回调频率高，给足余量，但防 DDoS
 *
 *   sensitiveWriteLimiter 敏感写操作（申请/成团/取消）：20 req/min per user
 *                        需配合 authMiddleware 在前面解析 userId
 *
 * 所有 limiter 均设置 skip trust proxy（app.set('trust proxy',1) 已配置）。
 * standardHeaders: true  → 向客户端返回 RateLimit-* 标准头
 * legacyHeaders: false   → 不返回 X-RateLimit-* 旧格式头
 *
 * 告警建议：当 429 响应超过 50 次/分钟时触发告警。
 */
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

/** 所有 /api 路由基础保护：100 req/min per IP */
export const globalApiLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试', error_code: 'RATE_LIMIT_EXCEEDED' },
  skip: (req) => req.path === '/health' || req.path === '/api/health',
});

/** 创建订单：10 req/min per IP */
export const paymentCreateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试', error_code: 'RATE_LIMIT_EXCEEDED' },
});

/** 支付回调（三方渠道调用）：120 req/min per IP */
export const paymentWebhookLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded', error_code: 'RATE_LIMIT_EXCEEDED' },
});

/**
 * 敏感写操作（招募申请/取消/成团等）：20 req/min per IP
 * 与 authMiddleware 配合使用，防止自动化脚本批量操作
 */
export const sensitiveWriteLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试', error_code: 'RATE_LIMIT_EXCEEDED' },
});

/**
 * 文件上传：10 req/min per IP
 * 防止上传轰炸消耗磁盘/带宽
 */
export const uploadLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '上传过于频繁，请稍后再试', error_code: 'RATE_LIMIT_EXCEEDED' },
});
