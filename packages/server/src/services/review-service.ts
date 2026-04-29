import { db } from '../db';
import { generateId } from '@trpg/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CampaignReview {
  id: string;
  campaign_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: 'gm' | 'player';
  rating: number;
  comment: string | null;
  created_at: Date;
}

export interface UserReputation {
  user_id: string;
  avg_rating: number;
  total_reviews: number;
  gm_reviews: number;
  player_reviews: number;
  updated_at: Date;
}

export interface CreateReviewParams {
  campaign_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: 'gm' | 'player';
  rating: number;
  comment?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 业务规则常量
// ─────────────────────────────────────────────────────────────────────────────

/** 允许提交评价的窗口期（天），房间结束后 N 天内有效 */
const REVIEW_WINDOW_DAYS = 14;

// ─────────────────────────────────────────────────────────────────────────────
// ReviewService
// ─────────────────────────────────────────────────────────────────────────────

export class ReviewService {
  /**
   * 提交评价。
   *
   * 业务约束：
   *  1. 被评价人必须与评价人同属该房间（GM ↔ 玩家）
   *  2. 房间必须处于 ended 状态
   *  3. 评价窗口期内（ended_at + REVIEW_WINDOW_DAYS）
   *  4. 同一 reviewer_id + reviewee_id + campaign_id 只能评价一次
   *  5. rating 范围 [1, 5]
   */
  async createReview(params: CreateReviewParams): Promise<CampaignReview> {
    const { campaign_id, reviewer_id, reviewee_id, reviewer_role, rating, comment } = params;

    // 参数校验
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error('INVALID_RATING');
    }
    if (reviewer_id === reviewee_id) {
      throw new Error('SELF_REVIEW_NOT_ALLOWED');
    }

    // 查房间
    const campaign = await db('campaigns')
      .where({ id: campaign_id })
      .select('id', 'gm_user_id', 'status', 'ended_at')
      .first();

    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    if (campaign.status !== 'ended') throw new Error('CAMPAIGN_NOT_ENDED');

    // 评价窗口期校验
    if (campaign.ended_at) {
      const windowEnd = new Date(campaign.ended_at);
      windowEnd.setDate(windowEnd.getDate() + REVIEW_WINDOW_DAYS);
      if (new Date() > windowEnd) throw new Error('REVIEW_WINDOW_EXPIRED');
    }

    // 校验 reviewer 与 reviewee 均为房间成员（GM 或玩家）
    await this._assertCampaignMembership(campaign_id, campaign.gm_user_id, reviewer_id);
    await this._assertCampaignMembership(campaign_id, campaign.gm_user_id, reviewee_id);

    // 校验角色一致性：reviewer_role 必须与 reviewer 在房间中的实际角色一致
    const isReviewerGm = campaign.gm_user_id === reviewer_id;
    if (reviewer_role === 'gm' && !isReviewerGm) throw new Error('ROLE_MISMATCH');
    if (reviewer_role === 'player' && isReviewerGm) throw new Error('ROLE_MISMATCH');

    // 写入评价（UNIQUE 约束防重复）
    const id = generateId();
    await db('campaign_reviews')
      .insert({
        id,
        campaign_id,
        reviewer_id,
        reviewee_id,
        reviewer_role,
        rating,
        comment: comment ?? null,
        created_at: new Date(),
      })
      .catch((err: { code?: string }) => {
        if (err?.code === 'ER_DUP_ENTRY') throw new Error('REVIEW_ALREADY_EXISTS');
        throw err;
      });

    // 异步更新信誉汇总（不阻塞响应）
    this._updateReputation(reviewee_id, reviewer_role).catch(() => {/* 忽略汇总失败，不影响评价写入 */});

    const row = await db('campaign_reviews').where({ id }).first();
    return this._rowToReview(row);
  }

  /**
   * 查询某房间已提交的评价列表（对评价双方公开）。
   */
  async listCampaignReviews(campaign_id: string): Promise<CampaignReview[]> {
    const rows = await db('campaign_reviews')
      .where({ campaign_id })
      .orderBy('created_at', 'asc');
    return rows.map((r: Record<string, unknown>) => this._rowToReview(r));
  }

  /**
   * 查询某用户的评价列表（他人对该用户的评价）。
   */
  async listUserReviews(
    user_id: string,
    limit = 20,
    offset = 0,
  ): Promise<CampaignReview[]> {
    const rows = await db('campaign_reviews')
      .where({ reviewee_id: user_id })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    return rows.map((r: Record<string, unknown>) => this._rowToReview(r));
  }

  /**
   * 获取用户信誉汇总，若尚无记录则返回默认零值。
   */
  async getReputation(user_id: string): Promise<UserReputation> {
    const row = await db('user_reputation').where({ user_id }).first();
    if (!row) {
      return {
        user_id,
        avg_rating: 0,
        total_reviews: 0,
        gm_reviews: 0,
        player_reviews: 0,
        updated_at: new Date(),
      };
    }
    return this._rowToReputation(row);
  }

  /**
   * 检查某用户在某房间是否已对另一用户提交过评价。
   */
  async hasReviewed(
    campaign_id: string,
    reviewer_id: string,
    reviewee_id: string,
  ): Promise<boolean> {
    const row = await db('campaign_reviews')
      .where({ campaign_id, reviewer_id, reviewee_id })
      .first();
    return !!row;
  }

  // ─── private ──────────────────────────────────────────────────────────────

  /**
   * 断言 userId 是该 campaign 的 GM 或已加入的玩家。
   */
  private async _assertCampaignMembership(
    campaign_id: string,
    gm_user_id: string,
    userId: string,
  ): Promise<void> {
    if (userId === gm_user_id) return; // GM 直接通过

    const member = await db('campaign_members')
      .where({ campaign_id, user_id: userId })
      .first();
    if (!member) throw new Error('USER_NOT_CAMPAIGN_MEMBER');
  }

  /**
   * 重新计算并 UPSERT 信誉汇总。
   * 每次有新评价时调用（非 GM role → player_reviews；gm role → gm_reviews）。
   */
  private async _updateReputation(
    reviewee_id: string,
    reviewer_role: 'gm' | 'player',
  ): Promise<void> {
    const agg = await db('campaign_reviews')
      .where({ reviewee_id })
      .select(
        db.raw('AVG(rating) as avg_rating'),
        db.raw('COUNT(*) as total_reviews'),
        db.raw("SUM(CASE WHEN reviewer_role = 'gm' THEN 1 ELSE 0 END) as gm_reviews"),
        db.raw("SUM(CASE WHEN reviewer_role = 'player' THEN 1 ELSE 0 END) as player_reviews"),
      )
      .first();

    await db('user_reputation')
      .insert({
        user_id: reviewee_id,
        avg_rating: parseFloat(agg.avg_rating ?? 0) || 0,
        total_reviews: Number(agg.total_reviews) || 0,
        gm_reviews: Number(agg.gm_reviews) || 0,
        player_reviews: Number(agg.player_reviews) || 0,
        updated_at: new Date(),
      })
      .onConflict('user_id')
      .merge(['avg_rating', 'total_reviews', 'gm_reviews', 'player_reviews', 'updated_at']);
  }

  private _rowToReview(row: Record<string, unknown>): CampaignReview {
    return {
      id: row.id as string,
      campaign_id: row.campaign_id as string,
      reviewer_id: row.reviewer_id as string,
      reviewee_id: row.reviewee_id as string,
      reviewer_role: row.reviewer_role as 'gm' | 'player',
      rating: Number(row.rating),
      comment: (row.comment as string | null) ?? null,
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at as string),
    };
  }

  private _rowToReputation(row: Record<string, unknown>): UserReputation {
    return {
      user_id: row.user_id as string,
      avg_rating: parseFloat(row.avg_rating as string) || 0,
      total_reviews: Number(row.total_reviews) || 0,
      gm_reviews: Number(row.gm_reviews) || 0,
      player_reviews: Number(row.player_reviews) || 0,
      updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at as string),
    };
  }
}

export const reviewService = new ReviewService();
