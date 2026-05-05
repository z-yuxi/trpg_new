import './utils/load-env';
import { httpServer, io } from './app';
import { startAiWorker } from './queue/ai-queue';
import cron from 'node-cron';
import { moduleService } from './services/module-service';
import { recruitmentService } from './services/recruitment-service';
import { recruitmentMetricsService } from './services/recruitment-metrics-service';
import { runDailyDataCheck } from './services/daily-check-service';
import { repairOpenPositionHistory } from './services/scene-participation';
import { trendingService } from './services/trending-service';
import { startPaymentScheduler, stopPaymentScheduler } from './services/payment-scheduler';
import { redis, redisPub, redisSub } from './db/redis';
import { db } from './db';
import { logInfo, logError, logWarn } from './utils/structured-logger';

const requiredEnvVars: string[] = [
  'JWT_SECRET', 'JWT_REFRESH_SECRET',
  'DB_HOST', 'REDIS_HOST',
  'ENCRYPTION_KEY', 'PHONE_HMAC_KEY',
];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[FATAL] Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// ENCRYPTION_KEY / PHONE_HMAC_KEY 格式校验（必须为 64 位十六进制）
const encKey = process.env['ENCRYPTION_KEY']!;
if (!/^[0-9a-fA-F]{64}$/.test(encKey)) {
  console.error('[FATAL] ENCRYPTION_KEY must be a 64-char hex string (32 bytes). ' +
    'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const phoneHmacKey = process.env['PHONE_HMAC_KEY']!;
if (!/^[0-9a-fA-F]{64}$/.test(phoneHmacKey)) {
  console.error('[FATAL] PHONE_HMAC_KEY must be a 64-char hex string (32 bytes). ' +
    'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

// 校验可选配置枚举值，非法值立即退出（避免运行时静默降级）
const visibilityPolicy = process.env['VISIBILITY_POLICY'];
if (visibilityPolicy !== undefined && !['legacy', 'new'].includes(visibilityPolicy)) {
  console.error(`[FATAL] Invalid VISIBILITY_POLICY: "${visibilityPolicy}". Must be "legacy" or "new"`);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => logInfo('SERVER_START', `Server running on port ${PORT}`));

// ── AI 异步任务 Worker ────────────────────────────────────────────────────────
startAiWorker(io);

// ── 支付对账 & 业务告警调度器 ─────────────────────────────────────────────────
startPaymentScheduler();

// ── 优雅关闭 ────────────────────────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  logInfo('SHUTDOWN_START', `收到 ${signal}，开始优雅关闭...`);
  stopPaymentScheduler();
  httpServer.close(async () => {
    try {
      await Promise.all([
        redis.quit(),
        redisPub.quit(),
        redisSub.quit(),
        db.destroy(),
      ]);
      logInfo('SHUTDOWN_DONE', '所有连接已关闭');
      process.exit(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError('SHUTDOWN_FAILED', 'critical', '关闭失败', { error: msg });
      process.exit(1);
    }
  });
  // 强制超时保底
  setTimeout(() => {
    logError('SHUTDOWN_TIMEOUT', 'critical', '超时，强制退出');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── 定时任务：每小时第 0 分执行一次，检查公示期到期的模组 ────────────────
cron.schedule('0 * * * *', async () => {
  try {
    await moduleService.completeExpiredPublicNotices();
    logInfo('CRON_MODULE_NOTICES', 'Completed expired public notices');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('CRON_MODULE_NOTICES_FAILED', 'medium', 'Error completing public notices', { error: msg });
  }
});

// ── 定时任务：每小时检查社区版模组认领缓冲期 ──────────────────────────────
// 1. 缓冲期剩余 < 24h → 发站内信提醒贡献者（仅发一次）
// 2. 缓冲期已到期 → 自动封存，状态 → archived_by_author
cron.schedule('30 * * * *', async () => {
  try {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { notificationService } = await import('./services/notification-service.js');
    const { generateId } = await import('@trpg/shared');

    // 1. 即将到期（缓冲期结束时间 <= 24h后 且 > 现在，且未封存）
    const aboutToExpire = await db('modules')
      .where('claim_deadline_at', '<=', in24h)
      .where('claim_deadline_at', '>', now)
      .whereNotIn('community_status', ['archived_by_author', 'private_use'])
      .whereNotNull('contributor_user_id')
      .select('id', 'name', 'contributor_user_id', 'claim_deadline_at');

    for (const mod of aboutToExpire) {
      // 检查是否已发过此警告（避免重复）
      const alreadySent = await db('user_notifications')
        .where({
          user_id: mod.contributor_user_id,
          type: 'module_claim_buffer_warning',
        })
        .whereRaw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.module_id')) = ?", [mod.id])
        .first();
      if (!alreadySent) {
        await notificationService.createNotification({
          userId: mod.contributor_user_id as string,
          type: 'module_claim_buffer_warning',
          title: '你的模组社区版即将封存',
          content: `《${mod.name}》的社区版将在24小时内自动封存，请登录处理。`,
          metadata: { module_id: mod.id, claim_deadline_at: (mod.claim_deadline_at as Date).toISOString() },
        });
      }
    }

    // 2. 已到期 → 自动封存
    const expired = await db('modules')
      .where('claim_deadline_at', '<=', now)
      .whereNotIn('community_status', ['archived_by_author', 'private_use'])
      .whereNotNull('claim_deadline_at')
      .select('id', 'name', 'contributor_user_id');

    for (const mod of expired) {
      await db('modules').where({ id: mod.id }).update({
        community_status: 'archived_by_author',
        status: 'archived',
        claim_deadline_at: null,
        updated_at: now,
      });
      if (mod.contributor_user_id) {
        await notificationService.createNotification({
          userId: mod.contributor_user_id as string,
          type: 'module_claim_decision',
          title: '社区版模组已自动封存',
          content: `《${mod.name}》缓冲期届满，已自动封存。贡献记录保留。`,
          metadata: { module_id: mod.id, decision: 'archive', reason: 'deadline_expired' },
        });
      }
    }

    if (aboutToExpire.length > 0 || expired.length > 0) {
      logInfo('CRON_CLAIM_BUFFER', 'Community claim buffer processed', { warned: aboutToExpire.length, archived: expired.length });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('CRON_CLAIM_BUFFER_FAILED', 'medium', 'Error processing community claim buffer', { error: msg });
  }
});

// ── 定时任务：每 5 分钟处理超期邀请（invited 24h 未确认 → rejected，并提升候补）
cron.schedule('*/5 * * * *', async () => {
  try {
    const count = await recruitmentService.expireInvites();
    if (count > 0) {
      logInfo('CRON_INVITE_EXPIRE', `Expired ${count} recruitment invite(s)`, { count });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('CRON_INVITE_EXPIRE_FAILED', 'medium', 'Error expiring recruitment invites', { error: msg });
  }
});

// ── 定时任务：每日 00:01 刷新热度排行缓存 ──────────────────────────────────
const trendingRefreshCron = process.env.TRENDING_REFRESH_CRON ?? '1 0 * * *';
cron.schedule(trendingRefreshCron, async () => {
  try {
    await trendingService.refreshCache();
    logInfo('CRON_TRENDING_REFRESH', 'Trending cache refreshed');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('CRON_TRENDING_REFRESH_FAILED', 'medium', 'Error refreshing trending cache', { error: msg });
  }
});

// ── 定时任务：每日 02:00 生成运营日报 + 异常告警巡检 ─────────────────────────
cron.schedule('0 2 * * *', async () => {
  try {
    // 失效前日缓存，确保日报数据是最新的
    await recruitmentMetricsService.invalidateCache();

    // 巡检告警
    const alerts = await recruitmentMetricsService.detectAlerts(7);
    if (alerts.length > 0) {
      for (const alert of alerts) {
        logWarn('METRICS_ALERT', alert.message, { alertType: alert.type });
      }
    } else {
      logInfo('CRON_METRICS_OK', '巡检完成，无异常告警');
    }

    // 数据治理巡检
    await runDailyDataCheck();

    // 位置历史修复：回写未关闭的 position_history 记录
    const fixedCount = await repairOpenPositionHistory();
    if (fixedCount > 0) {
      logInfo('CRON_POSITION_REPAIR', `Repaired open position_history records`, { count: fixedCount });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('CRON_DAILY_METRICS_FAILED', 'high', 'Error in daily metrics check', { error: msg });
  }
});

