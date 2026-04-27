import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@trpg/shared';
import { authService } from '../services/auth-service';
import { setupUserHandler } from './user-handler';
import { registerChatHandlers } from './chat-handler';

const SOCKET_ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',');

export type TypedIO = Server<ClientToServerEvents, ServerToClientEvents>;

export function createSocketServer(httpServer: HttpServer): TypedIO {
  const io: TypedIO = new Server(httpServer, {
    cors: { origin: SOCKET_ALLOWED_ORIGINS, credentials: true },
    pingInterval: 25000,
    pingTimeout: 10000,
  });

  const roomNsp = io.of('/room');
  roomNsp.use(async (socket, next) => {
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
  registerChatHandlers(roomNsp as Parameters<typeof registerChatHandlers>[0]);

  const userNsp = io.of('/user');
  userNsp.use(async (socket, next) => {
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
  setupUserHandler(userNsp as Parameters<typeof setupUserHandler>[0]);

  return io;
}
