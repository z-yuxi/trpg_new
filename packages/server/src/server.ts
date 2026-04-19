import './utils/load-env';
import { httpServer } from './app';
import cron from 'node-cron';
import { moduleService } from './services/module-service';

const requiredEnvVars: string[] = ['JWT_SECRET', 'DB_HOST', 'REDIS_HOST'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ── 定时任务：每小时第 0 分执行一次，检查公示期到期的模组 ────────────────
cron.schedule('0 * * * *', async () => {
  try {
    await moduleService.completeExpiredPublicNotices();
    console.log(`[Cron] Completed expired public notices at ${new Date().toISOString()}`);
  } catch (err: any) {
    console.error('[Cron] Error completing public notices:', err?.message ?? err);
  }
});

