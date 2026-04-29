/**
 * 招募域内部 Row Mappers & 工具函数
 *
 * 从 recruitment-service.ts 中拆出，避免单文件过长。
 * 只依赖 DB 层，不依赖任何 Service（避免循环依赖）。
 */
import type {
  RecruitmentPost,
  RecruitmentStatus,
  RecruitmentApplication,
  RecruitmentApplicationStatus,
} from '@trpg/shared';
import { db } from '../db';

export const INVITE_EXPIRY_HOURS = 24;

// ── JSON 解析工具 ─────────────────────────────────────────────────────────────

export function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch { /* ignore */ }
  }
  return [];
}

export function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// ── Row → 领域对象映射 ────────────────────────────────────────────────────────

export function rowToPost(row: Record<string, unknown>): RecruitmentPost {
  return {
    id: row['id'] as string,
    poster_id: row['poster_id'] as string,
    type: row['type'] as RecruitmentPost['type'],
    title: row['title'] as string,
    campaign_id: (row['campaign_id'] as string | null) ?? null,
    ruleset_id: row['ruleset_id'] as string,
    module_name: (row['module_name'] as string | null) ?? null,
    player_count_max: Number(row['player_count_max'] ?? 0),
    player_count_joined: Number(row['player_count_joined'] ?? 0),
    schedule_text: (row['schedule_text'] as string | null) ?? null,
    description: (row['description'] as string | null) ?? null,
    tags: parseJsonArray(row['tags']),
    metadata: parseJsonObject(row['metadata']),
    status: row['status'] as RecruitmentStatus,
    created_at: row['created_at'] as Date,
  };
}

export function rowToApplication(row: Record<string, unknown>): RecruitmentApplication {
  return {
    id: row['id'] as string,
    post_id: row['post_id'] as string,
    applicant_user_id: row['applicant_user_id'] as string,
    character_id: (row['character_id'] as string | null) ?? null,
    message: row['message'] as string,
    status: row['status'] as RecruitmentApplicationStatus,
    reject_reason: (row['reject_reason'] as string | null) ?? null,
    invited_expires_at: row['invited_expires_at']
      ? new Date(row['invited_expires_at'] as string | number)
      : null,
    waiting_position: row['waiting_position'] != null ? Number(row['waiting_position']) : null,
    created_at: row['created_at'] as Date,
    updated_at: row['updated_at'] as Date,
  };
}

// ── 内部状态机辅助函数 ────────────────────────────────────────────────────────

/** 计算当前候补队列最大位置，用于追加新候补 */
export async function nextWaitingPosition(postId: string): Promise<number> {
  const row = await db('recruitment_applications')
    .where({ post_id: postId, status: 'waiting' })
    .max<{ max_pos: number | null }[]>({ max_pos: 'waiting_position' })
    .first();
  return (row?.max_pos ?? 0) + 1;
}

/**
 * 重新计算帖子的 player_count_joined 与 status（open/full）。
 * grouped/closed/dissolved/archived 状态不受此函数影响。
 */
export async function recalculatePostCounters(postId: string): Promise<void> {
  const post = await db('recruitment_posts').where({ id: postId }).first() as Record<string, unknown> | null;
  if (!post) return;

  const currentStatus = post['status'] as RecruitmentStatus;
  if (['grouped', 'closed', 'dissolved', 'archived'].includes(currentStatus)) return;

  const confirmedCountRow = await db('recruitment_applications')
    .where({ post_id: postId, status: 'confirmed' })
    .count<{ total: number }[]>({ total: '*' })
    .first();
  const confirmedCount = Number(confirmedCountRow?.total ?? 0);

  const maxPlayers = Number(post['player_count_max'] ?? 0);
  const nextStatus: RecruitmentStatus = confirmedCount >= maxPlayers ? 'full' : 'open';

  await db('recruitment_posts').where({ id: postId }).update({
    player_count_joined: confirmedCount,
    status: nextStatus,
  });
}

/**
 * 当一个 invited 申请超时或被拒绝后，尝试将候补队列首位升级为 invited。
 */
export async function promoteNextWaiting(postId: string): Promise<void> {
  const post = await db('recruitment_posts').where({ id: postId }).first() as Record<string, unknown> | null;
  if (!post) return;
  const currentStatus = post['status'] as RecruitmentStatus;
  if (!['open', 'full'].includes(currentStatus)) return;

  const nextWaiting = await db('recruitment_applications')
    .where({ post_id: postId, status: 'waiting' })
    .orderBy('waiting_position', 'asc')
    .first() as Record<string, unknown> | null;

  if (!nextWaiting) return;

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
  await db('recruitment_applications').where({ id: nextWaiting['id'] }).update({
    status: 'invited',
    waiting_position: null,
    invited_expires_at: expiresAt,
    updated_at: db.fn.now(),
  });

  // 候补被提升后整体队列向前移一位
  await db('recruitment_applications')
    .where({ post_id: postId, status: 'waiting' })
    .whereNot({ id: nextWaiting['id'] as string })
    .decrement('waiting_position', 1);
}
