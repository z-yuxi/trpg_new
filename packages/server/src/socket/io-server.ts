import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';
import { authService } from '../services/auth-service';

export type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>;

export function createSocketServer(httpServer: HttpServer): TypedIO {
  const io: TypedIO = new Server(httpServer, {
    cors: { origin: '*' },
    pingInterval: 25000,
    pingTimeout: 10000,
  });

  // 鉴权中间件：从 auth token 中提取 userId
  io.of('/room').use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) throw new Error('Missing auth token');
      const payload = authService.verifyAccessToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.of('/user').use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string;
      if (!token) throw new Error('Missing auth token');
      const payload = authService.verifyAccessToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  return io;
}
