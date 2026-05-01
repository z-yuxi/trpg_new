import { randomUUID } from 'crypto';
import { db } from '../db';

// ── 类型 ────────────────────────────────────────────────────────────────────

export interface CampaignFeedback {
  id: string;
  campaign_id: string;
  user_id: string;
  star: string | null;
  wish: string | null;
  visibility: 'gm_only' | 'all_members';
  is_deleted: boolean;
  submitted_at: string;
  updated_at: string | null;
  /** 附加：用户昵称（查询时 join） */
  nickname?: string;
  avatar_url?: string | null;
}

export interface FeedbackSummary {
  submitted: CampaignFeedback[];
  pending: Array<{ user_id: string; nickname: string; avatar_url: string | null }>;
}

// ── 行转对象 ─────────────────────────────────────────────────────────────────

function rowToFeedback(row: Record<string, unknown>): CampaignFeedback {
  return {
    id: row['id'] as string,
    campaign_id: row['campaign_id'] as string,
    user_id: row['user_id'] as string,
    star: (row['star'] as string | null) ?? null,
    wish: (row['wish'] as string | null) ?? null,
    visibility: (row['visibility'] as 'gm_only' | 'all_members') ?? 'gm_only',
    is_deleted: Boolean(row['is_deleted']),
    submitted_at: row['submitted_at'] as string,
    updated_at: (row['updated_at'] as string | null) ?? null,
    nickname: row['nickname'] as string | undefined,
    avatar_url: (row['avatar_url'] as string | null) ?? null,
  };
}

// ── Service ──────────────────────────────────────────────────────────────────

class FeedbackService {
  /**
   * 提交或更新反馈（upsert）。
   * 两字段均为选填，但至少要调用过本方法才算"已提交"（即使两者都为 null）。
   */
  async upsertFeedback(
    campaignId: string,
    userId: string,
    data: { star?: string | null; wish?: string | null },
  ): Promise<CampaignFeedback> {
    // 确认 campaign 存在且已结束（也允许进行中提交，不强制，容忍 GM 手动触发）
    const campaign = await db('campaigns').where({ id: campaignId }).first();
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

    // 确认用户是成员（gm / player，不含 observer）
    const member = await db('campaign_members')
      .where({ campaign_id: campaignId, user_id: userId })
      .whereIn('role', ['gm', 'player'])
      .first();
    if (!member) throw new Error('NOT_A_MEMBER');

    const existing = await db('campaign_feedback')
      .where({ campaign_id: campaignId, user_id: userId })
      .first();

    const now = new Date().toISOString();

    if (existing) {
      await db('campaign_feedback')
        .where({ campaign_id: campaignId, user_id: userId })
        .update({
          star: data.star !== undefined ? (data.star ?? null) : existing.star,
          wish: data.wish !== undefined ? (data.wish ?? null) : existing.wish,
          is_deleted: false,
          updated_at: now,
        });
    } else {
      await db('campaign_feedback').insert({
        id: randomUUID(),
        campaign_id: campaignId,
        user_id: userId,
        star: data.star ?? null,
        wish: data.wish ?? null,
        visibility: 'gm_only',
        is_deleted: false,
        submitted_at: now,
        updated_at: null,
      });
    }

    const row = await db('campaign_feedback')
      .where({ campaign_id: campaignId, user_id: userId })
      .first();
    return rowToFeedback(row as Record<string, unknown>);
  }

  /** 获取当前用户自己的反馈（含已删除标记） */
  async getMyFeedback(campaignId: string, userId: string): Promise<CampaignFeedback | null> {
    const row = await db('campaign_feedback')
      .where({ campaign_id: campaignId, user_id: userId })
      .first();
    if (!row) return null;
    return rowToFeedback(row as Record<string, unknown>);
  }

  /** 软删除当前用户的反馈 */
  async deleteFeedback(campaignId: string, userId: string): Promise<void> {
    const existing = await db('campaign_feedback')
      .where({ campaign_id: campaignId, user_id: userId, is_deleted: false })
      .first();
    if (!existing) throw new Error('FEEDBACK_NOT_FOUND');
    await db('campaign_feedback')
      .where({ campaign_id: campaignId, user_id: userId })
      .update({ is_deleted: true, updated_at: new Date().toISOString() });
  }

  /**
   * GM 查看该团的所有反馈 + 未提交名单。
   * 只有 GM 本人可调用（路由层已鉴权）。
   */
  async getFeedbackSummary(campaignId: string): Promise<FeedbackSummary> {
    // 所有成员（gm + player，不含 observer）
    const members = await db('campaign_members as cm')
      .join('users as u', 'u.id', 'cm.user_id')
      .where('cm.campaign_id', campaignId)
      .whereIn('cm.role', ['gm', 'player'])
      .select('cm.user_id', 'u.nickname', 'u.avatar_url');

    // 已提交且未删除的反馈（join 昵称/头像）
    const feedbackRows = await db('campaign_feedback as cf')
      .join('users as u', 'u.id', 'cf.user_id')
      .where('cf.campaign_id', campaignId)
      .where('cf.is_deleted', false)
      .select(
        'cf.id', 'cf.campaign_id', 'cf.user_id', 'cf.star', 'cf.wish',
        'cf.visibility', 'cf.is_deleted', 'cf.submitted_at', 'cf.updated_at',
        'u.nickname', 'u.avatar_url',
      )
      .orderBy('cf.submitted_at', 'asc');

    const submitted = feedbackRows.map((r) => rowToFeedback(r as Record<string, unknown>));
    const submittedUserIds = new Set(submitted.map((f) => f.user_id));

    const pending = (members as Array<{ user_id: string; nickname: string; avatar_url: string | null }>)
      .filter((m) => !submittedUserIds.has(m.user_id))
      .map((m) => ({ user_id: m.user_id, nickname: m.nickname, avatar_url: m.avatar_url }));

    return { submitted, pending };
  }

  /**
   * 更新反馈可见性（GM 操作）。
   */
  async updateVisibility(
    campaignId: string,
    gmUserId: string,
    visibility: 'gm_only' | 'all_members',
  ): Promise<void> {
    const campaign = await db('campaigns').where({ id: campaignId }).first();
    if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
    if ((campaign as Record<string, unknown>)['gm_user_id'] !== gmUserId) throw new Error('FORBIDDEN');
    await db('campaign_feedback')
      .where({ campaign_id: campaignId, is_deleted: false })
      .update({ visibility });
  }
}

export const feedbackService = new FeedbackService();
