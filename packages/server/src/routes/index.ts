import { Router, type IRouter } from 'express';
import authRoutes from './auth';
import userRoutes from './users';
import campaignRoutes from './campaigns';
import characterRoutes from './characters';
import rulesetRoutes from './rulesets';
import recruitmentRoutes from './recruitment';
import logRoutes from './logs';
import notificationRoutes from './notifications';
import forumRoutes from './forum';

const router: IRouter = Router();

// 健康检查（Docker healthcheck 使用）
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/characters', characterRoutes);
router.use('/rulesets', rulesetRoutes);
router.use('/recruitment', recruitmentRoutes);
router.use('/logs', logRoutes);
router.use('/notifications', notificationRoutes);
router.use('/forum', forumRoutes);

export default router;
