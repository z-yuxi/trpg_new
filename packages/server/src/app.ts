import express, { type Application } from 'express';
import { createServer } from 'http';
import path from 'path';
import routes from './routes/index';
import { createSocketServer } from './socket';
import { errorHandler } from './middleware/error-handler';

const app: Application = express();
const uploadsDir = path.resolve(process.cwd(), 'uploads');

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/api', routes);

// 统一错误处理中间件（必须在所有路由之后注册）
app.use(errorHandler);

export const httpServer = createServer(app);
export const io = createSocketServer(httpServer);

export default app;
