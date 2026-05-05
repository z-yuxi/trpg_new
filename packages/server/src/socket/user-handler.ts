import type { Namespace, Socket } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';
import { redis, RedisKeys } from '../db/redis';
import { logError } from '../utils/structured-logger';

type UserSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type UserNamespace = Namespace<ClientToServerEvents, ServerToClientEvents>;

export function setupUserHandler(userNsp: UserNamespace): void {
  userNsp.on('connection', async (socket: UserSocket) => {
    const userId = socket.data.userId as string;
    if (!userId) {
      socket.disconnect();
      return;
    }

    // 加入以 user_id 命名的房间，方便后端定向推送
    await socket.join(`user:${userId}`);

    // 记录 user → socket 映射（用于外部向特定用户推送）
    await redis.set(RedisKeys.userSocket(userId), socket.id, 'EX', 86400);

    socket.on('disconnect', async () => {
      try {
        const current = await redis.get(RedisKeys.userSocket(userId));
        if (current === socket.id) {
          await redis.del(RedisKeys.userSocket(userId));
        }
        // 清理所有事件监听，防止内存泄漏
        socket.removeAllListeners();
      } catch (err) {
        const safeMsg = err instanceof Error ? err.message : 'Unknown error';
        logError('SOCKET_USER_DISCONNECT_CLEANUP_FAILED', 'warn', safeMsg, { userId });
      }
    });
  });
}

/**
 * 向特定用户推送通知（从其他服务调用）
 * 需要传入 userNsp 实例，或通过全局 io 访问
 */
export async function pushNotificationToUser(
  userNsp: UserNamespace,
  userId: string,
  notification: Parameters<ServerToClientEvents['notification_new']>[0]
): Promise<void> {
  userNsp.to(`user:${userId}`).emit('notification_new', notification);
}

export async function pushUnreadCount(
  userNsp: UserNamespace,
  userId: string,
  count: number
): Promise<void> {
  userNsp.to(`user:${userId}`).emit('unread_count_changed', { count });
}
