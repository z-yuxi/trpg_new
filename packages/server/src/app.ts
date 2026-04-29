import express, { type Application } from 'express';
import { createServer } from 'http';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import routes from './routes/index';
import { createSocketServer } from './socket';
import { globalErrorHandler } from './utils/error-response';
import { requestLogger } from './middleware/request-logger';

const app: Application = express();
const uploadsDir = path.resolve(process.cwd(), 'uploads');

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',');

app.use(helmet());
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(requestLogger);
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
  },
}));
app.use('/api', routes);
app.use(globalErrorHandler);

export const httpServer = createServer(app);
export const io = createSocketServer(httpServer);

export default app;
