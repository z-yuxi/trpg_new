/**
 * reputation-audit-service.ts
 * 信誉分变动审计 + 互评反作弊 + 申诉管理
 *
 * 职责：
 *  1. 每次评价写入后，记录信誉分变动快照（reputation_audit_log）
 *  2. 检测三类反作弊规则，在日志中打 flag（不直接阻断，仅标记）
 *  3. 提供运营后台的查询与申诉处理接口
 */
import { db } from '../db';
import { generateId } from '@trpg/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AntiCheatFlag = 'mutual_review' | 'rapid_reviews' | 'low_credibility' | null;

export interface ReputationAuditEntry {
  id: string;
  user_id: string;
  review_id: string;
  reviewer_id: string;
  campaign_id: string;
  reviewer_role: 'gm' | 'player';
  rating: number;
  old_avg_rating: number;
  new_avg_rating: number;
  old_total_reviews: number;
  new_total_reviews: number;
  anti_cheat_flag: AntiCheatFlag;
  created_at: Date;
}

export interface ReviewAppeal {
  id: string;
  review_id: string;
  appellant_id: string;
  reason: string;
  status: 'pending' | 'resolved_remove' | 'resolved_keep';
  resolved_by: string | null;
  resolution_note: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// 反作弊规则阈值
// ─────────────────────────────────────────────────────────────────────────────

/** 24h 内同一评价人提交评价超过此数量视为异常密集 */
const RAPID_REVIEW_THRESHOLD = 5;

/** 评价人历史评价数低于此值时，信誉影响可信度较低 */
const LOW_CREDIBILITY_THRESHOLD = 3;

// ─────────────────────────────────────────────────────────────────────────────
// ReputationAuditService
// ─────────────────────────────────────────────────────────────────────────────

export class ReputationAuditService {
  /**
   * 记录一次信誉分变动，并在入库前运行反作弊检测。
   * 由 ReviewService.createReview() 在更新信誉汇总后调用。
   */
  async logReputationChange(params: {
    review_id: string;
    user_id: string;        // 被评价人
    reviewer_id: string;
    campaign_id: string;
    reviewer_role: 'gm' | 'player';
    rating: number;
    old_avg_rating: number;
    new_avg_rating: number;
    old_total_reviews: number;
    new_total_reviews: number;
  }): Promise<void> {
    const flag = await this._detectAntiCheat(
      params.reviewer_id,
      params.user_id,
      params.campaign_id,
    );

    await db('reputation_audit_log').insert({
      id: generateId(),
      user_id: params.user_id,
      review_id: params.review_id,
      reviewer_id: params.reviewer_id,
      campaign_id: params.campaign_id,
      reviewer_role: params.reviewer_role,
      rating: params.rating,
      old_avg_rating: params.old_avg_rating,
      new_avg_rating: params.new_avg_rating,
      old_total_reviews: params.old_total_reviews,
      new_total_reviews: params.new_total_reviews,
      anti_cheat_flag: flag,
      created_at: new Date(),
    });
  }

  /**
   * 查询信誉分变动日志（运营后台）。
   * 支持按用户、反作弊标记、时间范围分页查询。
   */
  async listAuditLog(params: {
    user_id?: string;
    reviewer_id?: string;
    campaign_id?: string;
    anti_cheat_flag?: AntiCheatFlag | 'any_flag';
    from_date?: Date;
    to_date?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ReputationAuditEntry[]; total: number }> {
    const limit  = Math.min(100, Math.max(1, params.limit  ?? 20));
    const offset = Math.max(0, params.offset ?? 0);

    let q = db('reputation_audit_log');
    if (params.user_id)    q = q.where({ user_id: params.user_id });
    if (params.reviewer_id) q = q.where({ reviewer_id: params.reviewer_id });
    if (params.campaign_id) q = q.where({ campaign_id: params.campaign_id });
    if (params.anti_cheat_flag === 'any_flag') {
      q = q.whereNotNull('anti_cheat_flag');
    } else if (params.anti_cheat_flag) {
      q = q.where({ anti_cheat_flag: params.anti_cheat_flag });
    }
    if (params.from_date) q = q.where('created_at', '>=', params.from_date);
    if (params.to_date)   q = q.where('created_at', '<=', params.to_date);

    const countRow = await q.clone().count<{ total: number }[]>({ total: '*' }).first();
    const total = Number(countRow?.total ?? 0);

    const rows = await q
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((r: Record<string, unknown>) => this._rowToEntry(r)),
      total,
    };
  }

  /**
   * 查询所有被反作弊标记的日志条目（快捷接口，等价于 anti_cheat_flag='any_flag'）。
   */
  async listSuspicious(limit = 50, offset = 0): Promise<{ data: ReputationAuditEntry[]; total: number }> {
    return this.listAuditLog({ anti_cheat_flag: 'any_flag', limit, offset });
  }

  // ─── 申诉管理 ────────────────────────────────────────────────────────────

  /**
   * 用户提交申诉（每条评价只能申诉一次）。
   */
  async submitAppeal(params: {
    review_id: string;
    appellant_id: string;
    reason: string;
  }): Promise<ReviewAppeal> {
    const { review_id, appellant_id, reason } = params;

    if (!reason || reason.trim().length < 10) {
      throw Object.assign(new Error('申诉理由不能少于10个字符'), { status: 400 });
    }

    const id = generateId();
    await db('review_appeals')
      .insert({
        id,
        review_id,
        appellant_id,
        reason: reason.trim(),
        status: 'pending',
        created_at: new Date(),
      })
      .catch((err: { code?: string }) => {
        if (err?.code === 'ER_DUP_ENTRY') {
          throw Object.assign(new Error('APPEAL_ALREADY_EXISTS'), { status: 409 });
        }
        throw err;
      });

    return this._rowToAppeal(await db('review_appeals').where({ id }).first());
  }

  /**
   * 运营查询申诉列表。
   */
  async listAppeals(params: {
    status?: 'pending' | 'resolved_remove' | 'resolved_keep';
    appellant_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: ReviewAppeal[]; total: number }> {
    const limit  = Math.min(100, Math.max(1, params.limit  ?? 20));
    const offset = Math.max(0, params.offset ?? 0);

    let q = db('review_appeals');
    if (params.status)       q = q.where({ status: params.status });
    if (params.appellant_id) q = q.where({ appellant_id: params.appellant_id });

    const countRow = await q.clone().count<{ total: number }[]>({ total: '*' }).first();
    const total = Number(countRow?.total ?? 0);

    const rows = await q.orderBy('created_at', 'asc').limit(limit).offset(offset);
    return {
      data: rows.map((r: Record<string, unknown>) => this._rowToAppeal(r)),
      total,
    };
  }

  /**
   * 运营处理申诉（resolved_remove 或 resolved_keep）。
   * resolved_remove 时会将对应的 campaign_review 软删除（comment 清空 + 特殊标记），
   * 并重新计算被评价人信誉汇总（触发负向修正）。
   */
  async resolveAppeal(params: {
    appeal_id: string;
    admin_user_id: string;
    decision: 'resolved_remove' | 'resolved_keep';
    resolution_note?: string;
  }): Promise<ReviewAppeal> {
    const { appeal_id, admin_user_id, decision, resolution_note } = params;

    const appeal = await db('review_appeals')
      .where({ id: appeal_id, status: 'pending' })
      .first();
    if (!appeal) {
      throw Object.assign(new Error('APPEAL_NOT_FOUND_OR_ALREADY_RESOLVED'), { status: 404 });
    }

    await db('review_appeals').where({ id: appeal_id }).update({
      status: decision,
      resolved_by: admin_user_id,
      resolution_note: resolution_note?.trim() ?? null,
      resolved_at: new Date(),
    });

    // resolved_remove：将评价标记为已撤除（保留记录但清空内容）
    if (decision === 'resolved_remove') {
      await db('campaign_reviews').where({ id: appeal.review_id }).update({
        comment: '[已由运营移除]',
        rating: 3, // 中立分，减少对信誉的持续影响
      });
      // 异步重算信誉（不阻塞响应）
      this._recomputeReputation(appeal.reviewee_id ?? null).catch(() => {/* 忽略 */});
    }

    return this._rowToAppeal(await db('review_appeals').where({ id: appeal_id }).first());
  }

  // ─── private ─────────────────────────────────────────────────────────────

  /**
   * 反作弊检测，返回最高优先级的 flag（mutual > rapid > low_credibility > null）。
   * 仅标记，不阻断评价写入。
   */
  private async _detectAntiCheat(
    reviewerId: string,
    revieweeId: string,
    campaignId: string,
  ): Promise<AntiCheatFlag> {
    // 规则①：互评检测（同房间内 A 评了 B，且 B 也评了 A）
    const reverseReview = await db('campaign_reviews')
      .where({ campaign_id: campaignId, reviewer_id: revieweeId, reviewee_id: reviewerId })
      .first()
      .catch(() => null);
    if (reverseReview) return 'mutual_review';

    // 规则②：异常密集评价（24h 内提交评价数 >= RAPID_REVIEW_THRESHOLD）
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCountRow = await db('campaign_reviews')
      .where('reviewer_id', reviewerId)
      .where('created_at', '>=', since24h)
      .count<{ total: number }[]>({ total: '*' })
      .first()
      .catch(() => null);
    const recentCount = Number(recentCountRow?.total ?? 0);
    if (recentCount >= RAPID_REVIEW_THRESHOLD) return 'rapid_reviews';

    // 规则③：评价人历史评价数不足（可信度低，仅标记，权重参考）
    const historyCountRow = await db('campaign_reviews')
      .where('reviewer_id', reviewerId)
      .count<{ total: number }[]>({ total: '*' })
      .first()
      .catch(() => null);
    const historyCount = Number(historyCountRow?.total ?? 0);
    // 注意：这里 historyCount 包含了当前正在写入的那条，所以阈值用 <=
    if (historyCount <= LOW_CREDIBILITY_THRESHOLD) return 'low_credibility';

    return null;
  }

  /** 重算信誉汇总（申诉移除评价后调用） */
  private async _recomputeReputation(userId: string | null): Promise<void> {
    if (!userId) return;
    const agg = await db('campaign_reviews')
      .where({ reviewee_id: userId })
      .where('comment', '!=', '[已由运营移除]')
      .select(
        db.raw('AVG(rating) as avg_rating'),
        db.raw('COUNT(*) as total_reviews'),
        db.raw("SUM(CASE WHEN reviewer_role = 'gm' THEN 1 ELSE 0 END) as gm_reviews"),
        db.raw("SUM(CASE WHEN reviewer_role = 'player' THEN 1 ELSE 0 END) as player_reviews"),
      )
      .first()
      .catch(() => null);
    if (!agg) return;

    await db('user_reputation')
      .insert({
        user_id: userId,
        avg_rating: parseFloat(agg.avg_rating ?? 0) || 0,
        total_reviews: Number(agg.total_reviews) || 0,
        gm_reviews: Number(agg.gm_reviews) || 0,
        player_reviews: Number(agg.player_reviews) || 0,
        updated_at: new Date(),
      })
      .onConflict('user_id')
      .merge(['avg_rating', 'total_reviews', 'gm_reviews', 'player_reviews', 'updated_at']);
  }

  private _rowToEntry(row: Record<string, unknown>): ReputationAuditEntry {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      review_id: row.review_id as string,
      reviewer_id: row.reviewer_id as string,
      campaign_id: row.campaign_id as string,
      reviewer_role: row.reviewer_role as 'gm' | 'player',
      rating: Number(row.rating),
      old_avg_rating: parseFloat(row.old_avg_rating as string) || 0,
      new_avg_rating: parseFloat(row.new_avg_rating as string) || 0,
      old_total_reviews: Number(row.old_total_reviews),
      new_total_reviews: Number(row.new_total_reviews),
      anti_cheat_flag: (row.anti_cheat_flag as AntiCheatFlag) ?? null,
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    };
  }

  private _rowToAppeal(row: Record<string, unknown>): ReviewAppeal {
    return {
      id: row.id as string,
      review_id: row.review_id as string,
      appellant_id: row.appellant_id as string,
      reason: row.reason as string,
      status: row.status as ReviewAppeal['status'],
      resolved_by: (row.resolved_by as string | null) ?? null,
      resolution_note: (row.resolution_note as string | null) ?? null,
      resolved_at: row.resolved_at
        ? new Date(row.resolved_at as string)
        : null,
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    };
  }
}

export const reputationAuditService = new ReputationAuditService();
