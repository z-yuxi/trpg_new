/**
 * 每日数据巡检任务
 *
 * 在 server.ts cron 中调用，非破坏性：只检查、记录、告警，不自动修复数据。
 * 需要修复时，由人工运行 repair-recruitment-data.ts 脚本。
 *
 * 巡检项目：
 *   Check-1: player_count_joined 与 confirmed 数量偏差
 *   Check-2: 过期 invited 积压数量
 *   Check-3: waiting_position 空洞数
 *   Check-4: grouped 帖子无 campaign_id
 *   Check-5: 关键表行数健康度（突变检测）
 */
import { db } from '../db';
import { redis } from '../db/redis';
import { logInfo, logError, logWarn } from '../utils/structured-logger';

export interface DailyCheckResult {
  ts: string;
  passed: boolean;
  issues: Array<{ check: string; severity: 'warn' | 'critical'; detail: string }>;
}

const ROW_COUNT_CACHE_KEY = 'daily_check:row_counts';
const ROW_COUNT_DELTA_THRESHOLD = 0.5; // 行数变化超过 50% 视为异常

export async function runDailyDataCheck(): Promise<DailyCheckResult> {
  const result: DailyCheckResult = {
    ts: new Date().toISOString(),
    passed: true,
    issues: [],
  };

  const addIssue = (check: string, severity: 'warn' | 'critical', detail: string) => {
    result.issues.push({ check, severity, detail });
    if (severity === 'critical') result.passed = false;
  };

  // ── Check-1: player_count_joined 偏差 ──────────────────────────────────────
  try {
    const badPosts = await db.raw(`
      SELECT COUNT(*) as cnt
      FROM recruitment_posts rp
      LEFT JOIN (
        SELECT post_id, COUNT(*) as actual
        FROM recruitment_applications
        WHERE status = 'confirmed'
        GROUP BY post_id
      ) ca ON ca.post_id = rp.id
      WHERE rp.status NOT IN ('draft', 'archived')
        AND rp.player_count_joined != COALESCE(ca.actual, 0)
    `) as [Array<{ cnt: number }>, unknown] | Array<{ cnt: number }>;

    const cnt = Number(
      Array.isArray(badPosts) && Array.isArray(badPosts[0])
        ? (badPosts[0] as Array<Record<string, unknown>>)[0]?.['cnt']
        : (badPosts as Array<Record<string, unknown>>)[0]?.['cnt'] ?? 0,
    );

    if (cnt > 0) {
      addIssue('Check-1', cnt > 5 ? 'critical' : 'warn', `${cnt} 个帖子 player_count_joined 与实际不符`);
    }
  } catch (e) {
    addIssue('Check-1', 'warn', `检查失败: ${(e as Error).message}`);
  }

  // ── Check-2: 过期 invited 积压 ─────────────────────────────────────────────
  try {
    const row = await db('recruitment_applications')
      .where('status', 'invited')
      .where('invited_expires_at', '<', new Date())
      .count('* as cnt')
      .first() as Record<string, unknown> | undefined;
    const cnt = Number(row?.['cnt'] ?? 0);
    if (cnt > 0) {
      addIssue('Check-2', cnt > 20 ? 'critical' : 'warn', `${cnt} 条过期 invited 申请未处理`);
    }
  } catch (e) {
    addIssue('Check-2', 'warn', `检查失败: ${(e as Error).message}`);
  }

  // ── Check-3: waiting_position 空洞 ────────────────────────────────────────
  try {
    // 找出有候补申请的帖子
    const postIds = await db('recruitment_applications')
      .where('status', 'waiting')
      .distinct('post_id')
      .pluck('post_id') as string[];

    let gapCount = 0;
    for (const postId of postIds) {
      const positions = await db('recruitment_applications')
        .where({ post_id: postId, status: 'waiting' })
        .orderBy('waiting_position', 'asc')
        .pluck('waiting_position') as number[];

      for (let i = 0; i < positions.length; i++) {
        if (positions[i] !== i + 1) { gapCount++; break; }
      }
    }
    if (gapCount > 0) {
      addIssue('Check-3', 'warn', `${gapCount} 个帖子候补队列 position 不连续`);
    }
  } catch (e) {
    addIssue('Check-3', 'warn', `检查失败: ${(e as Error).message}`);
  }

  // ── Check-4: grouped 无 campaign_id ──────────────────────────────────────
  try {
    const row = await db('recruitment_posts')
      .where('status', 'grouped')
      .whereNull('campaign_id')
      .count('* as cnt')
      .first() as Record<string, unknown> | undefined;
    const cnt = Number(row?.['cnt'] ?? 0);
    if (cnt > 0) {
      addIssue('Check-4', 'critical', `${cnt} 个 grouped 帖子无 campaign_id`);
    }
  } catch (e) {
    addIssue('Check-4', 'warn', `检查失败: ${(e as Error).message}`);
  }

  // ── Check-5: 关键表行数突变检测 ───────────────────────────────────────────
  try {
    const tables = ['recruitment_posts', 'recruitment_applications'] as const;
    const currentCounts: Record<string, number> = {};

    for (const table of tables) {
      const row = await db(table).count('* as cnt').first() as Record<string, unknown>;
      currentCounts[table] = Number(row['cnt'] ?? 0);
    }

    // 与昨日行数对比
    try {
      const cached = await redis.get(ROW_COUNT_CACHE_KEY);
      if (cached) {
        const prev = JSON.parse(cached) as Record<string, number>;
        for (const table of tables) {
          const prevCount = prev[table] ?? 0;
          const currCount = currentCounts[table];
          if (prevCount > 0 && currCount < prevCount * (1 - ROW_COUNT_DELTA_THRESHOLD)) {
            addIssue(
              'Check-5',
              'critical',
              `表 ${table} 行数骤降：${prevCount} → ${currCount}（降幅超 ${ROW_COUNT_DELTA_THRESHOLD * 100}%）`,
            );
          }
        }
      }
      // 更新缓存（TTL 25小时，确保每天覆盖）
      await redis.setex(ROW_COUNT_CACHE_KEY, 25 * 60 * 60, JSON.stringify(currentCounts));
    } catch {
      // Redis 不可用时跳过历史对比
    }
  } catch (e) {
    addIssue('Check-5', 'warn', `检查失败: ${(e as Error).message}`);
  }

  // ── 汇总输出 ──────────────────────────────────────────────────────────────
  if (result.issues.length === 0) {
    logInfo('DAILY_CHECK_ALL_PASSED', `全部检查通过`, { ts: result.ts });
  } else {
    for (const issue of result.issues) {
      if (issue.severity === 'critical') {
        logError('DAILY_CHECK_ISSUE', 'critical', issue.detail, { check: issue.check });
      } else {
        logWarn('DAILY_CHECK_ISSUE', issue.detail, { check: issue.check });
      }
    }
  }

  return result;
}
