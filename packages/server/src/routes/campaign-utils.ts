/**
 * campaign-utils.ts — 战役路由共享工具
 *
 * 导出：
 *   - serverErr(res, err)                    统一 500 响应
 *   - ensureCampaignMember(id, userId)       成员鉴权
 *   - ensureCampaignGm(id, userId)           GM 鉴权
 *   - listSceneConnections(campaignId)       场景连接查询
 *   - parseStoryTime / toStoryMinutes        剧情时间工具
 *   - Zod schemas：创建/更新用
 */

import type { Response } from 'express';
import { z } from 'zod';
import type { StoryTime } from '@trpg/shared';
import { db } from '../db';
import { safeErrorMessage } from '../utils/error-response';

// ─── 错误响应辅助 ──────────────────────────────────────────────────────────

export function serverErr(res: Response, err: unknown, defaultMsg = '操作失败，请稍后再试'): void {
  console.error('[campaigns]', err instanceof Error ? err.message : err);
  res.status(500).json({ error: safeErrorMessage(err, defaultMsg) });
}

// ─── 鉴权辅助 ─────────────────────────────────────────────────────────────

export async function ensureCampaignMember(
  campaignId: string,
  userId: string,
): Promise<{ ok: boolean; isGm: boolean; campaign?: Record<string, unknown> }> {
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  if (!campaign) return { ok: false, isGm: false };
  if ((campaign as Record<string, unknown>)['gm_user_id'] === userId) {
    return { ok: true, isGm: true, campaign: campaign as Record<string, unknown> };
  }
  const member = await db('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .where('css.campaign_id', campaignId)
    .where('cs.user_id', userId)
    .first();
  if (member) return { ok: true, isGm: false, campaign: campaign as Record<string, unknown> };
  return { ok: false, isGm: false };
}

export async function ensureCampaignGm(
  campaignId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
  if (!campaign) return { ok: false, status: 404, error: 'Campaign not found' };
  if (campaign.gm_user_id !== userId)
    return { ok: false, status: 403, error: 'Only GM can manage scene connections' };
  return { ok: true };
}

// ─── 数据查询辅助 ─────────────────────────────────────────────────────────

export async function listSceneConnections(campaignId: string) {
  return db('scene_connections as sc')
    .leftJoin('scenes as fs', 'fs.id', 'sc.from_scene_id')
    .leftJoin('scenes as ts', 'ts.id', 'sc.to_scene_id')
    .where('sc.campaign_id', campaignId)
    .select('sc.*', 'fs.name as from_scene_name', 'ts.name as to_scene_name')
    .orderBy('sc.created_at', 'asc');
}

// ─── 剧情时间工具 ─────────────────────────────────────────────────────────

export function parseStoryTime(value: unknown): StoryTime | null {
  try {
    if (!value) return null;
    if (typeof value === 'string') return JSON.parse(value) as StoryTime;
    if (typeof value === 'object') return value as StoryTime;
    return null;
  } catch {
    return null;
  }
}

export function toStoryMinutes(time: StoryTime): number {
  return (time.day - 1) * 24 * 60 + time.hour * 60 + time.minute;
}

export function addStoryMinutes(base: StoryTime, deltaMinutes: number): StoryTime {
  let total = toStoryMinutes(base) + deltaMinutes;
  if (total < 0) total = 0;
  const day = Math.floor(total / (24 * 60)) + 1;
  const hour = Math.floor((total % (24 * 60)) / 60);
  const minute = total % 60;
  return { day, hour, minute };
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(128),
  ruleset_id: z.string().min(1),
  module_id: z.string().optional().nullable(),
  is_listed_publicly: z.boolean().optional(),
  allow_ob: z.boolean().optional(),
});

export const quickCreateSchema = z.object({
  name: z.string().min(1).max(128),
  ruleset_id: z.string().min(1),
  module_id: z.string().optional().nullable(),
  allow_ob: z.boolean().optional(),
  is_listed_publicly: z.boolean().optional(),
  recruit: z.boolean().optional(),
  recruitment: z
    .object({
      title: z.string().min(1).max(50).optional(),
      description: z.string().max(2000).optional(),
      player_count_max: z.number().int().min(1).max(20).optional(),
      schedule_text: z.string().max(255).optional(),
      schedule_weekday: z
        .array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']))
        .max(7)
        .optional()
        .nullable(),
      schedule_time_slot: z
        .enum(['morning', 'afternoon', 'evening', 'night'])
        .optional()
        .nullable(),
      tags: z.array(z.string()).max(10).optional(),
    })
    .optional(),
});

export const createSceneSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['lobby', 'room', 'outdoor', 'dungeon', 'special']).optional(),
  description: z.string().max(2000).optional(),
  atmosphere_keywords: z.array(z.string().max(20)).max(5).optional(),
});

export const createNpcSchema = z.object({
  name: z.string().min(1).max(100),
  display_name: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  avatar_url: z.string().max(500).optional(),
  voice_tips: z.string().max(500).optional(),
  attributes: z.unknown().optional(),
  skills: z.unknown().optional(),
  resources: z.unknown().optional(),
  is_temporary: z.boolean().optional(),
  is_playable: z.boolean().optional(),
  is_active: z.boolean().optional(),
  source_module_npc_id: z.string().optional(),
});

export const updateNpcSchema = createNpcSchema.partial().omit({ source_module_npc_id: true });

export const sceneObPermissionSchema = z.object({
  user_id: z.string().min(1),
});
