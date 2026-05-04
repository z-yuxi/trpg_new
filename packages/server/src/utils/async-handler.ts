/**
 * 异步操作错误处理包装工具
 * 确保所有 Promise 都被正确处理，防止未捕获的 rejection
 */

import { logError } from './structured-logger';

/**
 * Express 路由处理器包装：自动捕获 async 错误
 * 用法：
 * router.post('/endpoint', asyncHandler(async (req, res) => {
 *   // 代码直接抛错，由包装器处理
 * }));
 */
export function asyncHandler(fn: Function): Function {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err: unknown) => {
      const msgOrErr = err instanceof Error ? err.message : String(err);
      logError('ROUTE_HANDLER_ERROR', 'high', `Unhandled route error: ${msgOrErr}`);
      next(err);
    });
  };
}

/**
 * Socket.IO 事件处理器包装：自动捕获 async 错误
 * 用法：
 * socket.on('event', asyncSocketHandler(async (data) => {
 *   // 代码直接抛错，由包装器处理和 emit
 * }, socket));
 */
export function asyncSocketHandler(
  fn: (data: any) => Promise<void>,
  socket: any,
): (data: any) => void {
  return (data: any) => {
    Promise.resolve(fn(data)).catch((err: unknown) => {
      const msgOrErr = err instanceof Error ? err.message : String(err);
      logError('SOCKET_HANDLER_ERROR', 'high', `Unhandled socket error: ${msgOrErr}`, {
        userId: socket.data?.userId,
        event: socket.eventNames?.()[0],
      });
      socket.emit('error_message', {
        code: 'HANDLER_ERROR',
        message: '操作失败，请稍后重试',
      });
    });
  };
}

/**
 * 后台任务包装：处理 BullMQ 或定时任务中的错误
 * 用法：
 * const job = await queue.add('taskName', data, { ... });
 * job.process(asyncJobHandler(async (job) => { ... }));
 */
export function asyncJobHandler(fn: (job: any) => Promise<any>): (job: any) => Promise<any> {
  return async (job: any) => {
    try {
      return await fn(job);
    } catch (err: unknown) {
      const msgOrErr = err instanceof Error ? err.message : String(err);
      logError('JOB_HANDLER_ERROR', 'high', `Job failed: ${msgOrErr}`, {
        jobName: job.name,
        jobId: job.id,
      });
      throw err; // 重新抛出给 BullMQ 处理重试
    }
  };
}

/**
 * 一次性监听器，防止内存泄漏
 * 用法：
 * onceAsync(emitter, 'event', async () => { ... });
 */
export async function onceAsync(
  emitter: any,
  event: string,
  handler: Function,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const wrappedHandler = async (...args: any[]) => {
      try {
        await handler(...args);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    emitter.once(event, wrappedHandler);
    // 防止内存泄漏：设置超时移除监听器
    const timeout = setTimeout(() => {
      emitter.removeListener(event, wrappedHandler);
      reject(new Error(`Timeout waiting for ${event}`));
    }, 30000); // 30秒超时
    // 监听器触发时清理超时
    emitter.once(event, () => clearTimeout(timeout));
  });
}

/**
 * 批量处理 Promise，自动处理 rejection
 * 用法：
 * const results = await safeAllSettled([promise1, promise2, ...]);
 * results.forEach((result, i) => {
 *   if (result.status === 'fulfilled') console.log(result.value);
 *   else logError('BATCH_ERROR', 'medium', result.reason);
 * });
 */
export async function safeAllSettled<T>(
  promises: Promise<T>[],
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(promises).catch((err: unknown) => {
    const msgOrErr = err instanceof Error ? err.message : String(err);
    logError('PROMISE_SETTLEMENT_ERROR', 'high', `Promise.allSettled failed: ${msgOrErr}`);
    throw err;
  });
}
