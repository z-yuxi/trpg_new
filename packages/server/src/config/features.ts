/**
 * 功能开关（Feature Flags）
 *
 * 所有布尔型功能开关集中在此文件，通过环境变量控制。
 * 模块加载时快照一次；若需热更新，请接入 Redis 动态读取（见注释）。
 *
 * 命名规范：
 *   FF_*   - 功能路径开关（Feature Flag）
 *   *_DISABLED - 降级/熔断开关（依赖不可用时关掉）
 *
 * 简单版（当前）：改环境变量 + 重启生效。
 * 进阶版：将值写入 Redis Hash `feature_flags`，
 *          每次调用时从 Redis 读取（注意 async 转换）。
 */

function flag(envVar: string, defaultValue = false): boolean {
  const val = process.env[envVar];
  if (val === undefined) return defaultValue;
  return val === 'true' || val === '1';
}

export const FEATURES = {
  // ── 可见性策略 ─────────────────────────────────────────────────
  /** 使用新版消息可见性策略（否则回退 legacy） */
  NEW_VISIBILITY_POLICY: process.env['VISIBILITY_POLICY'] === 'new',

  // ── AI 功能 ────────────────────────────────────────────────────
  /** AI Agent 自动发帖（false = 仅草稿，不发布） */
  AI_AGENT_POSTING: flag('FF_AI_AGENT_POSTING'),
  /** DeepSeek API 熔断（true = 关闭所有 AI 调用，返回 503） */
  AI_API_DISABLED: flag('FF_AI_API_DISABLED'),

  // ── 模组 / 内容 ────────────────────────────────────────────────
  /** 模组认领流程（创作者认领社区版模组） */
  MODULE_CLAIM_FLOW: flag('FF_MODULE_CLAIM'),
  /** 故事录公开发布 */
  STORY_LOG_PUBLISH: flag('FF_STORY_LOG_PUBLISH', true),

  // ── 支付 ───────────────────────────────────────────────────────
  /** 启用创作者分成支付（false = 仅记录，不实际转账） */
  CREATOR_PAYOUT_ENABLED: flag('FF_CREATOR_PAYOUT', false),

  // ── 实名认证 ───────────────────────────────────────────────────
  /** 实名认证服务熔断（true = 跳过认证，记录日志） */
  REAL_NAME_DISABLED: flag('FF_REAL_NAME_DISABLED'),

  // ── 短信 ───────────────────────────────────────────────────────
  /** 短信服务熔断（true = 跳过发送，记录日志） */
  SMS_DISABLED: flag('FF_SMS_DISABLED'),
} as const;

export type FeatureKey = keyof typeof FEATURES;
