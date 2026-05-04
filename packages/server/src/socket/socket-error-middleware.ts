/**
 * Socket.IO 全局错误处理中间件和工具函数
 * 确保所有 socket 事件处理中的错误都被正确捕获和日志记录
 */

import { Socket } from 'socket.io';
import { logError, extractSafeErrorInfo } from '../utils/structured-logger';

/**
 * Socket.IO 错误响应标准格式
 */
export interface SocketErrorResponse {
  code: string;
  message: string;
  requestId?: string;
}

/**
 * 创建安全的 Socket.IO 事件处理器
 * 自动处理 Promise 和错误，防止内存泄漏
 * 
 * 用法：
 * socket.on('myEvent', createSafeSocketHandler(socket, async (data, userId) => {
 *   // 你的处理逻辑
 * }, 'MY_EVENT'));
 */
export function createSafeSocketHandler(
  socket: Socket,
  handler: (data: any, userId: string) => Promise<void>,
  eventName: string,
): (data: any) => void {
  return (data: any) => {
    const userId = socket.data?.userId as string | undefined;
    if (!userId) {
      logError('SOCKET_NO_USERID', 'medium', `Event ${eventName} received without userId`);
      socket.emit('error_message', { code: 'AUTH_REQUIRED', message: '需要重新认证' });
      return;
    }

    Promise.resolve(handler(data, userId))
      .catch((err: unknown) => {
        const { msg, code } = extractSafeErrorInfo(err);
        logError(code, 'medium', msg, { event: eventName, userId });
        
        // 发送安全的错误响应给客户端
        socket.emit('error_message', {
          code: code || 'HANDLER_ERROR',
          message: '操作失败，请稍后重试',
        } as SocketErrorResponse);
      });
  };
}

/**
 * 为 Socket 应用清理和错误处理中间件
 * 在 socket 连接建立后立即调用
 * 
 * 用法：
 * io.on('connection', (socket) => {
 *   applySocketErrorMiddleware(socket);
 *   // 后续注册事件处理器
 * });
 */
export function applySocketErrorMiddleware(socket: Socket): void {
  const userId = socket.data?.userId as string | undefined;

  // 捕获所有未捕获的错误
  socket.on('error', (err: Error) => {
    const { msg, code } = extractSafeErrorInfo(err);
    logError(code, 'high', `Socket error: ${msg}`, { userId });
  });

  // 捕获 disconnect 中的错误
  const originalDisconnect = socket.disconnect.bind(socket);
  socket.disconnect = function(close?: boolean) {
    try {
      // 移除所有监听器，防止内存泄漏
      this.removeAllListeners();
      return originalDisconnect(close);
    } catch (err) {
      const { msg, code } = extractSafeErrorInfo(err);
      logError(code, 'medium', `Disconnect error: ${msg}`, { userId });
      return this;
    }
  };
}

/**
 * 清理 Socket 监听器
 * 在 disconnect 事件中调用
 * 
 * 用法：
 * socket.on('disconnect', () => {
 *   cleanupSocketListeners(socket);
 *   // 其他清理逻辑
 * });
 */
export function cleanupSocketListeners(socket: Socket): void {
  try {
    socket.removeAllListeners();
  } catch (err) {
    const { msg, code } = extractSafeErrorInfo(err);
    logError(code, 'warn', `Cleanup error: ${msg}`);
  }
}

/**
 * 验证 Socket 用户认证
 * 在处理需要认证的事件前调用
 * 
 * 返回 userId 或 null（未认证）
 */
export function getAuthenticatedUserId(socket: Socket): string | null {
  return (socket.data?.userId as string | undefined) ?? null;
}

/**
 * 检查 Socket 是否仍然连接
 */
export function isSocketConnected(socket: Socket): boolean {
  return socket.connected && socket.id !== undefined;
}
