/**
 * 应用层自定义错误类。
 * userMessage 是安全的、可直接返回给客户端的消息；
 * internalMessage（可选）仅用于服务端日志，不对外暴露；
 * code（可选）是机器可读的错误代码，用于客户端细粒度处理。
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly userMessage: string,
    public readonly internalMessage?: string,
    public readonly code?: string,
  ) {
    super(userMessage);
    this.name = 'AppError';
  }

  /** 快捷工厂：带 error_code 的业务错误 */
  static business(statusCode: number, code: string, userMessage: string, internalMessage?: string): AppError {
    return new AppError(statusCode, userMessage, internalMessage, code);
  }
}

/** 标准业务错误代码（与客户端 api.ts 保持同步） */
export const ErrorCode = {
  VALIDATION_FAILED:              'VALIDATION_FAILED',
  NOT_FOUND:                      'NOT_FOUND',
  UNAUTHORIZED:                   'UNAUTHORIZED',
  FORBIDDEN:                      'FORBIDDEN',
  CONFLICT:                       'CONFLICT',
  // 招募相关
  RECRUITMENT_NOT_FOUND:          'RECRUITMENT_NOT_FOUND',
  RECRUITMENT_CLOSED:             'RECRUITMENT_CLOSED',
  RECRUITMENT_ALREADY_APPLIED:    'RECRUITMENT_ALREADY_APPLIED',
  RECRUITMENT_SELF_APPLY:         'RECRUITMENT_SELF_APPLY',
  RECRUITMENT_INVITE_EXPIRED:     'RECRUITMENT_INVITE_EXPIRED',
  RECRUITMENT_WRONG_STATE:        'RECRUITMENT_WRONG_STATE',
  // 幂等
  IDEMPOTENCY_CONFLICT:           'IDEMPOTENCY_CONFLICT',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];
