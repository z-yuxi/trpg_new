import './utils/load-env';
import { httpServer } from './app';
import cron from 'node-cron';
import { moduleService } from './services/module-service';
import { recruitmentService } from './services/recruitment-service';
import { redis, redisPub, redisSub } from './db/redis';
import { db } from './db';

const requiredEnvVars: string[] = ['JWT_SECRET', 'DB_HOST', 'REDIS_HOST'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// ── 优雅关闭 ────────────────────────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  console.log(`[Shutdown] 收到 ${signal}，开始优雅关闭...`);
  httpServer.close(async () => {
    try {
      await Promise.all([
        redis.quit(),
        redisPub.quit(),
        redisSub.quit(),
        db.destroy(),
      ]);
      console.log('[Shutdown] 所有连接已关闭');
      process.exit(0);
    } catch (err) {
      console.error('[Shutdown] 关闭失败:', err);
      process.exit(1);
    }
  });
  // 强制超时保底
  setTimeout(() => {
    console.error('[Shutdown] 超时，强制退出');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── 定时任务：每小时第 0 分执行一次，检查公示期到期的模组 ────────────────
cron.schedule('0 * * * *', async () => {
  try {
    await moduleService.completeExpiredPublicNotices();
    console.log(`[Cron] Completed expired public notices at ${new Date().toISOString()}`);
  } catch (err: any) {
    console.error('[Cron] Error completing public notices:', err?.message ?? err);
  }
});

// ── 定时任务：每 5 分钟处理超期邀请（invited 24h 未确认 → rejected，并提升候补）
cron.schedule('*/5 * * * *', async () => {
  try {
    const count = await recruitmentService.expireInvites();
    if (count > 0) {
      console.log(`[Cron] Expired ${count} recruitment invite(s) at ${new Date().toISOString()}`);
    }
  } catch (err: any) {
    console.error('[Cron] Error expiring recruitment invites:', err?.message ?? err);
  }
});

