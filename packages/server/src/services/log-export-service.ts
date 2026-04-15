import knex from '../db/knex-config';
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
  seq: number;
  scene_id: string;
  scene_name: string;
  story_time_day: number | null;
  story_time_hour: number | null;
  story_time_minute: number | null;
  speaker: string;
  msg_type: string;
  content: string;
  dice_expression: string | null;
  dice_total: number | null;
  dice_detail: string | null;
}

/**
 * 验证请求者是否有权限导出指定 campaign 的日志
 */
async function checkPermission(campaignId: string, userId: string): Promise<boolean> {
  const campaign = await knex('campaigns')
    .where({ id: campaignId })
    .select('created_by')
    .first();
  if (!campaign) return false;
  // 创建者（GM）有权限
  if (campaign.created_by === userId) return true;
  // 参与者也有权限
  const member = await knex('campaign_members')
    .where({ campaign_id: campaignId, user_id: userId })
    .first();
  return !!member;
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
  const campaign = await knex('campaigns')
    .where({ id: campaign_id })
    .select('id', 'title', 'ruleset_id', 'created_by')
    .first();
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  // 获取参与者列表
  const members = await knex('campaign_members as cm')
    .join('character_instances as ci', 'ci.id', 'cm.character_instance_id')
    .join('character_cards as cc', 'cc.id', 'ci.card_id')
    .join('users as u', 'u.id', 'cm.user_id')
    .where('cm.campaign_id', campaign_id)
    .select(
      'ci.id as character_id',
      'cc.name as character_name',
      'u.username as player_name',
    )
    .catch(() => [] as { character_id: string; character_name: string; player_name: string }[]);

  // 获取场景列表
  let sceneQuery = knex('scenes').where({ campaign_id });
  if (scene_ids && scene_ids.length > 0) {
    sceneQuery = sceneQuery.whereIn('id', scene_ids);
  }
  const scenes = await sceneQuery.select('id', 'name', 'description');

  const sceneObjs: Omit<ILFScene, 'messages'>[] = scenes.map((s: { id: string; name: string; description?: string }) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));

  // 获取消息列表
  let msgQuery = knex('chat_messages as cm')
    .join('scenes as s', 's.id', 'cm.scene_id')
    .where('s.campaign_id', campaign_id)
    .orderBy('cm.seq', 'asc')
    .select(
      'cm.seq',
      'cm.scene_id',
      's.name as scene_name',
      'cm.story_time_day',
      'cm.story_time_hour',
      'cm.story_time_minute',
      'cm.speaker',
      'cm.msg_type',
      'cm.content',
      'cm.dice_expression',
      'cm.dice_total',
      'cm.dice_detail',
    );
  if (scene_ids && scene_ids.length > 0) {
    msgQuery = msgQuery.whereIn('cm.scene_id', scene_ids);
  }
  const rawMessages: RawMessage[] = await msgQuery.catch(() => []);

  const messages: ILFMessage[] = rawMessages.map((m, idx) => ({
    seq: m.seq ?? idx + 1,
    scene_id: m.scene_id,
    scene_name: m.scene_name,
    story_time:
      m.story_time_day !== null
        ? { day: m.story_time_day!, hour: m.story_time_hour!, minute: m.story_time_minute! }
        : null,
    speaker: m.speaker,
    type: (m.msg_type as ILFMessage['type']) ?? 'dialogue',
    content: m.content,
    dice_result:
      m.dice_expression
        ? {
            expression: m.dice_expression,
            total: m.dice_total ?? 0,
            detail: m.dice_detail ?? '',
          }
        : undefined,
  }));

  // 获取 GM 用户名作为 author
  const gmUser = await knex('users')
    .where({ id: campaign.created_by })
    .select('username')
    .first()
    .catch(() => null as { username: string } | null);

  const doc = buildILFDocument({
    campaignTitle: campaign.title,
    ruleSystem: campaign.ruleset_id ?? 'Unknown',
    author: gmUser?.username,
    players: members,
    scenes: sceneObjs,
    messages,
  });

  return format === 'markdown' ? ilfToPlainText(doc) : serializeILF(doc);
}
