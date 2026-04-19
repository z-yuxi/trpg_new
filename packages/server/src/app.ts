import express, { type Application } from 'express';
import { createServer } from 'http';
import path from 'path';
import routes from './routes/index';
import { createSocketServer } from './socket';

const app: Application = express();
const uploadsDir = path.resolve(process.cwd(), 'uploads');

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));
app.use('/api', routes);

export const httpServer = createServer(app);
export const io = createSocketServer(httpServer);

export default app;
