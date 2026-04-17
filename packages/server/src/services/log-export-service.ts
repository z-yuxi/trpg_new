import { db } from '../db';
import {
  buildILFDocument,
  serializeILF,
  ilfToPlainText,
  type ILFMessage,
  type ILFScene,
} from '@trpg/shared';

interface ExportOptions {
  campaign_id: string;
  format: 'json' | 'markdown';
  scene_ids?: string[];
  requester_id: string;
}

interface RawMessage {
  id: string;
  scene_id: string;
  scene_name: string;
  story_time: string | null;
  sender_nickname: string | null;
  sender_char_name: string | null;
  message_type: string;
  content: string;
  metadata: string | null;
}

/**
 * 验证请求者是否有权限导出指定 campaign 的日志
 */
async function checkPermission(campaignId: string, userId: string): Promise<boolean> {
  const campaign = await db('campaigns')
    .where({ id: campaignId })
    .select('gm_user_id')
    .first();
  if (!campaign) return false;
  // GM 有权限
  if (campaign.gm_user_id === userId) return true;
  // 角色绑定过该团的玩家也有权限
  const state = await db('character_scene_states')
    .join('character_sheets as cs', 'cs.id', 'character_scene_states.character_id')
    .where({ 'character_scene_states.campaign_id': campaignId, 'cs.user_id': userId })
    .first();
  return !!state;
}

/**
 * 导出 campaign 的 ILF 文档
 */
export async function exportCampaignLog(opts: ExportOptions): Promise<string> {
  const { campaign_id, format, scene_ids, requester_id } = opts;

  // 权限检查
  const allowed = await checkPermission(campaign_id, requester_id);
  if (!allowed) throw Object.assign(new Error('Forbidden'), { status: 403 });

  // 获取 campaign 基础信息
  const campaign = await db('campaigns')
    .where({ id: campaign_id })
    .select('id', 'name', 'ruleset_id', 'gm_user_id')
    .first();
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  // 获取参与者列表（通过 character_scene_states 关联）
  const members = await db('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .join('users as u', 'u.id', 'cs.user_id')
    .where('css.campaign_id', campaign_id)
    .select(
      'cs.id as character_id',
      'cs.name as character_name',
      'u.nickname as player_name',
    )
    .catch(() => [] as { character_id: string; character_name: string; player_name: string }[]);

  // 获取场景列表（scenes 表无 description 字段）
  let sceneQuery = db('scenes').where({ campaign_id });
  if (scene_ids && scene_ids.length > 0) {
    sceneQuery = sceneQuery.whereIn('id', scene_ids);
  }
  const scenes = await sceneQuery.select('id', 'name');

  const sceneObjs: Omit<ILFScene, 'messages'>[] = scenes.map((s: { id: string; name: string }) => ({
    id: s.id,
    name: s.name,
  }));

  // 获取消息列表（按雪花 ID 升序，story_time 是 JSON 字段）
  let msgQuery = db('chat_messages as cm')
    .join('scenes as s', 's.id', 'cm.scene_id')
    .join('users as u', 'u.id', 'cm.sender_user_id')
    .leftJoin('character_sheets as cs', 'cs.id', 'cm.sender_character_id')
    .where('s.campaign_id', campaign_id)
    .orderBy('cm.id', 'asc')
    .select(
      'cm.id',
      'cm.scene_id',
      's.name as scene_name',
      'cm.story_time',
      'u.nickname as sender_nickname',
      'cs.name as sender_char_name',
      'cm.message_type',
      'cm.content',
      'cm.metadata',
    );
  if (scene_ids && scene_ids.length > 0) {
    msgQuery = msgQuery.whereIn('cm.scene_id', scene_ids);
  }
  const rawMessages: RawMessage[] = await msgQuery.catch(() => []);

  const messages: ILFMessage[] = rawMessages.map((m, idx) => {
    const storyTime = m.story_time
      ? (typeof m.story_time === 'string' ? JSON.parse(m.story_time) : m.story_time)
      : null;
    const metadata = m.metadata
      ? (typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata)
      : null;

    return {
      seq: idx + 1,
      scene_id: m.scene_id,
      scene_name: m.scene_name,
      story_time: storyTime,
      speaker: m.sender_char_name ?? m.sender_nickname ?? 'unknown',
      type: (m.message_type as ILFMessage['type']) ?? 'narrative',
      content: m.content,
      dice_result: metadata?.dice_expression
        ? {
            expression: metadata.dice_expression,
            total: metadata.dice_total ?? 0,
            detail: metadata.dice_detail ?? '',
          }
        : undefined,
    };
  });

  // 获取 GM 昵称作为 author
  const gmUser = await db('users')
    .where({ id: campaign.gm_user_id })
    .select('nickname')
    .first()
    .catch(() => null as { nickname: string } | null);

  const doc = buildILFDocument({
    campaignTitle: campaign.name,
    ruleSystem: campaign.ruleset_id ?? 'Unknown',
    author: gmUser?.nickname,
    players: members,
    scenes: sceneObjs,
    messages,
  });

  return format === 'markdown' ? ilfToPlainText(doc) : serializeILF(doc);
}
