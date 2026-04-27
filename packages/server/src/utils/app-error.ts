/**
 * 应用层自定义错误类。
 * userMessage 是安全的、可直接返回给客户端的消息；
 * internalMessage（可选）仅用于服务端日志，不对外暴露。
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly userMessage: string,
    public readonly internalMessage?: string,
  ) {
    super(userMessage);
    this.name = 'AppError';
  }
}
