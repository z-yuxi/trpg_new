/**
 * 招募漏斗运营指标服务
 *
 * 提供：
 * 1. 实时漏斗快照（总帖/发布率/申请转化率/邀请确认率/候补转正率/成团率）
 * 2. 每日日报聚合（按日期分组）
 * 3. 漏斗数据入 Redis 缓存（TTL 10min），减少 DB 查询压力
 *
 * 指标定义：
 *   - 发布率         = published_posts / total_posts
 *   - 申请转化率     = applied_posts（至少有1条申请的帖数）/ published_posts
 *   - 邀请确认率     = confirmed_apps / invited_apps（全时间窗口）
 *   - 候补转正率     = (waiting→confirmed) / total_waiting
 *   - 成团率         = grouped_posts / published_posts
 *   - 平均确认时长   = avg(confirmed_at - invited_at) 小时
 */
import { db } from '../db';
import { redis } from '../db/redis';

// ── 类型定义 ─────────────────────────────────────────────────────────────────

export interface RecruitmentFunnelSnapshot {
  /** 快照时间 */
  ts: string;
  /** 统计窗口（天） */
  window_days: number;
  /** 帖子指标 */
  posts: {
    total: number;
    published: number;
    publish_rate: number;       // 百分比
    grouped: number;
    group_rate: number;         // 百分比（基于 published）
    applied: number;            // 有申请的帖数
    apply_post_rate: number;    // 百分比（基于 published）
  };
  /** 申请指标 */
  applications: {
    total: number;
    pending: number;
    invited: number;
    confirmed: number;
    rejected: number;
    waiting: number;
    invite_confirm_rate: number;  // confirmed / invited 百分比
    waiting_promote_rate: number; // 候补中最终 confirmed 的比率
    avg_confirm_hours: number | null; // 平均邀请→确认耗时（小时）
  };
}

export interface DailyRecruitmentReport {
  date: string;               // YYYY-MM-DD
  new_posts: number;          // 当日新建帖数
  new_published: number;      // 当日发布帖数
  new_applications: number;   // 当日新增申请数
  new_confirmed: number;      // 当日新增确认入团数
  new_grouped: number;        // 当日成团帖数
  new_rejected: number;       // 当日拒绝申请数
  avg_time_to_confirm_hours: number | null;
}

export interface MetricAlert {
  type: 'FUNNEL_DROP' | 'STALE_INVITES' | 'LOW_PUBLISH_RATE' | 'HIGH_REJECT_RATE';
  message: string;
  value: number;
  threshold: number;
  ts: string;
}

// ── Redis 缓存 key ────────────────────────────────────────────────────────────

const CACHE_KEY_FUNNEL = (days: number) => `metrics:recruitment:funnel:${days}d`;
const CACHE_TTL_SECONDS = 600; // 10 分钟

// ── 告警阈值 ──────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  MIN_PUBLISH_RATE: 30,       // 发布率低于 30% 告警
  MAX_STALE_INVITES: 20,      // 过期邀请积压超 20 条告警
  MIN_CONFIRM_RATE: 40,       // 邀请确认率低于 40% 告警
  MAX_REJECT_RATE: 70,        // 拒绝率超 70% 告警
} as const;

// ── 服务实现 ─────────────────────────────────────────────────────────────────

export class RecruitmentMetricsService {
  /**
   * 获取漏斗快照（带缓存）
   * @param windowDays 统计时间窗口（默认 7 天）
   */
  async getFunnelSnapshot(windowDays = 7): Promise<RecruitmentFunnelSnapshot> {
    const cacheKey = CACHE_KEY_FUNNEL(windowDays);

    // 尝试读缓存
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as RecruitmentFunnelSnapshot;
    } catch {
      // Redis 不可用时跳过缓存
    }

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    // ── 帖子聚合 ──────────────────────────────────────────────────────────────
    const postRows = await db('recruitment_posts')
      .where('created_at', '>=', since)
      .select(
        db.raw('count(*) as total'),
        db.raw("sum(case when status != 'draft' then 1 else 0 end) as published"),
        db.raw("sum(case when status = 'grouped' then 1 else 0 end) as grouped"),
      )
      .first() as Record<string, unknown> | undefined;

    const totalPosts = Number(postRows?.['total'] ?? 0);
    const publishedPosts = Number(postRows?.['published'] ?? 0);
    const groupedPosts = Number(postRows?.['grouped'] ?? 0);

    // 有申请的帖子数
    const appliedPostRow = await db('recruitment_posts as rp')
      .join('recruitment_applications as ra', 'rp.id', 'ra.post_id')
      .where('rp.created_at', '>=', since)
      .whereNot('rp.status', 'draft')
      .countDistinct('rp.id as cnt')
      .first() as Record<string, unknown> | undefined;
    const appliedPosts = Number(appliedPostRow?.['cnt'] ?? 0);

    // ── 申请聚合 ──────────────────────────────────────────────────────────────
    const appRows = await db('recruitment_applications')
      .where('created_at', '>=', since)
      .select(
        db.raw('count(*) as total'),
        db.raw("sum(case when status = 'pending'   then 1 else 0 end) as pending"),
        db.raw("sum(case when status = 'invited'   then 1 else 0 end) as invited"),
        db.raw("sum(case when status = 'confirmed' then 1 else 0 end) as confirmed"),
        db.raw("sum(case when status = 'rejected'  then 1 else 0 end) as rejected"),
        db.raw("sum(case when status = 'waiting'   then 1 else 0 end) as waiting"),
      )
      .first() as Record<string, unknown> | undefined;

    const totalApps    = Number(appRows?.['total']     ?? 0);
    const pendingApps  = Number(appRows?.['pending']   ?? 0);
    const invitedApps  = Number(appRows?.['invited']   ?? 0);
    const confirmedApps= Number(appRows?.['confirmed'] ?? 0);
    const rejectedApps = Number(appRows?.['rejected']  ?? 0);
    const waitingApps  = Number(appRows?.['waiting']   ?? 0);

    // 候补最终转正数（原 waiting → 现 confirmed，通过 waiting_position 历史无法精确追溯，
    // 用近似：所有在窗口内最终 confirmed 且 post 在窗口内满员过的申请数）
    const waitingPromotedRow = await db('recruitment_applications')
      .where('created_at', '>=', since)
      .where('status', 'confirmed')
      .whereNotNull('waiting_position') // 曾经是候补（waiting_position 字段有历史值，但 update 后被清空）
      .count('* as cnt')
      .first() as Record<string, unknown> | undefined;
    // 注意：waiting_position 在 confirm 时被清空，此处只能统计当前仍在 waiting 队列的转正
    // 实际生产应有 application_history 表，此处给近似值
    const waitingPromoted = Number(waitingPromotedRow?.['cnt'] ?? 0);

    // 平均确认时长：需要 updated_at（confirmed 时更新）- 上次 invited 时间（无历史表时近似）
    // 此处用 invited_expires_at - INVITE_EXPIRY_HOURS 估算 invited_at
    const INVITE_EXPIRY_HOURS = 24;
    const avgConfirmRow = await db('recruitment_applications')
      .where('created_at', '>=', since)
      .where('status', 'confirmed')
      .whereNotNull('invited_expires_at')
      .select(
        db.raw(
          `avg(timestampdiff(HOUR, 
            date_sub(invited_expires_at, interval ${INVITE_EXPIRY_HOURS} hour),
            updated_at
          )) as avg_hours`,
        ),
      )
      .first() as Record<string, unknown> | undefined;
    const avgConfirmHours = avgConfirmRow?.['avg_hours'] != null
      ? Number(avgConfirmRow['avg_hours'])
      : null;

    // 计算派生指标
    const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 1000) / 10 : 0;

    const snapshot: RecruitmentFunnelSnapshot = {
      ts: new Date().toISOString(),
      window_days: windowDays,
      posts: {
        total: totalPosts,
        published: publishedPosts,
        publish_rate: pct(publishedPosts, totalPosts),
        grouped: groupedPosts,
        group_rate: pct(groupedPosts, publishedPosts),
        applied: appliedPosts,
        apply_post_rate: pct(appliedPosts, publishedPosts),
      },
      applications: {
        total: totalApps,
        pending: pendingApps,
        invited: invitedApps,
        confirmed: confirmedApps,
        rejected: rejectedApps,
        waiting: waitingApps,
        invite_confirm_rate: pct(confirmedApps, confirmedApps + rejectedApps + invitedApps),
        waiting_promote_rate: pct(waitingPromoted, waitingApps + waitingPromoted),
        avg_confirm_hours: avgConfirmHours,
      },
    };

    // 写入缓存
    try {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(snapshot));
    } catch {
      // 忽略缓存写入失败
    }

    return snapshot;
  }

  /**
   * 生成每日日报（按日期分组）
   * @param days 查询最近 N 天的日报
   */
  async getDailyReports(days = 30): Promise<DailyRecruitmentReport[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const postRows = await db('recruitment_posts')
      .where('created_at', '>=', since)
      .select(
        db.raw("date_format(created_at, '%Y-%m-%d') as date"),
        db.raw('count(*) as new_posts'),
        db.raw("sum(case when status != 'draft' then 1 else 0 end) as new_published"),
        db.raw("sum(case when status = 'grouped' then 1 else 0 end) as new_grouped"),
      )
      .groupByRaw("date_format(created_at, '%Y-%m-%d')")
      .orderBy('date', 'desc') as Array<Record<string, unknown>>;

    const appRows = await db('recruitment_applications')
      .where('created_at', '>=', since)
      .select(
        db.raw("date_format(created_at, '%Y-%m-%d') as date"),
        db.raw('count(*) as new_applications'),
        db.raw("sum(case when status = 'confirmed' then 1 else 0 end) as new_confirmed"),
        db.raw("sum(case when status = 'rejected'  then 1 else 0 end) as new_rejected"),
      )
      .groupByRaw("date_format(created_at, '%Y-%m-%d')")
      .orderBy('date', 'desc') as Array<Record<string, unknown>>;

    // 合并 post 和 app 数据
    const appMap = new Map<string, Record<string, unknown>>();
    for (const row of appRows) appMap.set(row['date'] as string, row);

    return postRows.map((row) => {
      const date = row['date'] as string;
      const app = appMap.get(date) ?? {};
      return {
        date,
        new_posts:        Number(row['new_posts']       ?? 0),
        new_published:    Number(row['new_published']   ?? 0),
        new_applications: Number(app['new_applications'] ?? 0),
        new_confirmed:    Number(app['new_confirmed']   ?? 0),
        new_grouped:      Number(row['new_grouped']     ?? 0),
        new_rejected:     Number(app['new_rejected']    ?? 0),
        avg_time_to_confirm_hours: null, // 需要 application_history 表精确计算
      };
    });
  }

  /**
   * 检测漏斗异常并返回告警列表
   * 用于定时任务中的主动巡检
   */
  async detectAlerts(windowDays = 7): Promise<MetricAlert[]> {
    const snapshot = await this.getFunnelSnapshot(windowDays);
    const alerts: MetricAlert[] = [];
    const ts = new Date().toISOString();

    // 发布率过低
    if (snapshot.posts.total >= 5 && snapshot.posts.publish_rate < THRESHOLDS.MIN_PUBLISH_RATE) {
      alerts.push({
        type: 'LOW_PUBLISH_RATE',
        message: `发布率 ${snapshot.posts.publish_rate}% 低于阈值 ${THRESHOLDS.MIN_PUBLISH_RATE}%`,
        value: snapshot.posts.publish_rate,
        threshold: THRESHOLDS.MIN_PUBLISH_RATE,
        ts,
      });
    }

    // 邀请确认率过低
    if (
      (snapshot.applications.invited + snapshot.applications.confirmed) >= 10 &&
      snapshot.applications.invite_confirm_rate < THRESHOLDS.MIN_CONFIRM_RATE
    ) {
      alerts.push({
        type: 'FUNNEL_DROP',
        message: `邀请确认率 ${snapshot.applications.invite_confirm_rate}% 低于阈值 ${THRESHOLDS.MIN_CONFIRM_RATE}%`,
        value: snapshot.applications.invite_confirm_rate,
        threshold: THRESHOLDS.MIN_CONFIRM_RATE,
        ts,
      });
    }

    // 过期邀请积压（invited 超过24h）
    const staleInviteRow = await db('recruitment_applications')
      .where('status', 'invited')
      .where('invited_expires_at', '<', new Date())
      .count('* as cnt')
      .first() as Record<string, unknown> | undefined;
    const staleCount = Number(staleInviteRow?.['cnt'] ?? 0);
    if (staleCount > THRESHOLDS.MAX_STALE_INVITES) {
      alerts.push({
        type: 'STALE_INVITES',
        message: `过期未处理邀请积压 ${staleCount} 条（阈值 ${THRESHOLDS.MAX_STALE_INVITES}）`,
        value: staleCount,
        threshold: THRESHOLDS.MAX_STALE_INVITES,
        ts,
      });
    }

    // 拒绝率过高
    const totalDecided = snapshot.applications.confirmed + snapshot.applications.rejected;
    if (totalDecided >= 20) {
      const rejectRate = Math.round((snapshot.applications.rejected / totalDecided) * 1000) / 10;
      if (rejectRate > THRESHOLDS.MAX_REJECT_RATE) {
        alerts.push({
          type: 'HIGH_REJECT_RATE',
          message: `拒绝率 ${rejectRate}% 高于阈值 ${THRESHOLDS.MAX_REJECT_RATE}%`,
          value: rejectRate,
          threshold: THRESHOLDS.MAX_REJECT_RATE,
          ts,
        });
      }
    }

    return alerts;
  }

  /**
   * 失效指定窗口的缓存（在数据发生变化时主动调用）
   */
  async invalidateCache(windowDays?: number): Promise<void> {
    try {
      if (windowDays) {
        await redis.del(CACHE_KEY_FUNNEL(windowDays));
      } else {
        // 失效所有漏斗缓存
        for (const days of [1, 7, 30]) {
          await redis.del(CACHE_KEY_FUNNEL(days));
        }
      }
    } catch {
      // 忽略
    }
  }
}

export const recruitmentMetricsService = new RecruitmentMetricsService();

