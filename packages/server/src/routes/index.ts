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
import moduleRoutes from './modules';
import uploadRoutes from './upload';
import occupationRoutes from './occupations';
import reportsRoutes from './reports';
import gmNotesRoutes from './gm-notes';
import metricsRoutes from './metrics';
import membershipRoutes from './membership';
import experimentRoutes from './experiments';
import { db } from '../db';
import { redis } from '../db/redis';

const router: IRouter = Router();

// ── 健康检查（Docker healthcheck / 监控告警探针） ────────────────────────
router.get('/health', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // DB ping
  try {
    await db.raw('SELECT 1');
    checks['db'] = 'ok';
  } catch {
    checks['db'] = 'error';
  }

  // Redis ping
  try {
    await redis.ping();
    checks['redis'] = 'ok';
  } catch {
    checks['redis'] = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res
    .status(allOk ? 200 : 503)
    .json({
      status: allOk ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version ?? 'unknown',
      checks,
    });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/characters', characterRoutes);
router.use('/rulesets', rulesetRoutes);
router.use('/recruitment', recruitmentRoutes);
router.use('/logs', logRoutes);
router.use('/notifications', notificationRoutes);
router.use('/forum', forumRoutes);
router.use('/modules', moduleRoutes);
router.use('/upload', uploadRoutes);
router.use('/occupations', occupationRoutes);
router.use('/reports', reportsRoutes);
router.use('/campaigns', gmNotesRoutes);
router.use('/metrics', metricsRoutes);
router.use('/membership', membershipRoutes);
router.use('/experiments', experimentRoutes);

export default router;
