import express, { type Application } from 'express';
import { createServer } from 'http';
import routes from './routes/index';
import { createSocketServer } from './socket';

const app: Application = express();
app.use(express.json());
app.use('/api', routes);

export const httpServer = createServer(app);
export const io = createSocketServer(httpServer);

export default app;
