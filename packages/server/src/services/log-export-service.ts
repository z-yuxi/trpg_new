import { db } from '../db';
import {
  buildILFDocument,
  serializeILF,
  ilfToPlainText,
  type ILFMessage,
  type ILFScene,
} from '@trpg/shared';
import type { StoryTime } from '@trpg/shared';

interface ExportOptions {
  campaign_id: string;
  format: 'json' | 'markdown' | 'text';
  mode: 'player' | 'full';
  sort_strategy?: 'chronological' | 'scene' | 'interleave' | 'custom';
  simulate_user_id?: string;
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
  visible_to: string | null;
}

function normalizeMessageType(type: string): ILFMessage['type'] {
  if (type === 'dialogue' || type === 'narration' || type === 'dice' || type === 'system' || type === 'ooc') {
    return type;
  }
  return 'narration';
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function sortMessages(messages: ILFMessage[], strategy: ExportOptions['sort_strategy']): ILFMessage[] {
  if (strategy === 'scene') {
    return [...messages].sort((left, right) => {
      if (left.scene_name === right.scene_name) return left.seq - right.seq;
      return left.scene_name.localeCompare(right.scene_name, 'zh-CN');
    });
  }

  return [...messages].sort((left, right) => left.seq - right.seq);
}

function ilfToSimpleText(doc: ReturnType<typeof buildILFDocument>): string {
  const lines: string[] = [];
  lines.push(doc.campaign.metadata.campaign_title);
  lines.push(`规则系统: ${doc.campaign.metadata.rule_system}`);
  lines.push(`导出时间: ${doc.campaign.metadata.export_at}`);
  lines.push('');

  for (const scene of doc.campaign.scenes) {
    lines.push(`== 场景 ${scene.name} ==`);
    for (const msg of scene.messages) {
      const time = msg.story_time
        ? ` [D${msg.story_time.day} ${String(msg.story_time.hour).padStart(2, '0')}:${String(msg.story_time.minute).padStart(2, '0')}]`
        : '';
      lines.push(`${time} ${msg.speaker}: ${msg.content}`.trim());
    }
    lines.push('');
  }

  return lines.join('\n');
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
  const { campaign_id, format, scene_ids, requester_id, mode, simulate_user_id, sort_strategy } = opts;

  // 权限检查
  const allowed = await checkPermission(campaign_id, requester_id);
  if (!allowed) throw Object.assign(new Error('Forbidden'), { status: 403 });

  // 获取 campaign 基础信息
  const campaign = await db('campaigns')
    .where({ id: campaign_id })
    .select('id', 'name', 'ruleset_id', 'gm_user_id')
    .first();
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });
  const isRequesterGm = campaign.gm_user_id === requester_id;

  if (mode === 'full' && !isRequesterGm) {
    throw Object.assign(new Error('只有 GM 可以导出完整剧本'), { status: 403 });
  }

  if (simulate_user_id && !isRequesterGm) {
    throw Object.assign(new Error('只有 GM 可以模拟玩家视角导出'), { status: 403 });
  }

  const effectiveUserId = simulate_user_id ?? requester_id;

  const viewerCharacterRows = await db('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .where({ 'css.campaign_id': campaign_id, 'cs.user_id': effectiveUserId })
    .select('cs.id')
    .catch(() => [] as Array<{ id: string }>);
  const viewerCharacterIds = viewerCharacterRows.map((row) => row.id);

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
      'cm.visible_to',
    );
  if (scene_ids && scene_ids.length > 0) {
    msgQuery = msgQuery.whereIn('cm.scene_id', scene_ids);
  }
  const rawMessages: RawMessage[] = await msgQuery.catch(() => []);

  const filteredMessages = rawMessages.filter((message) => {
    if (mode === 'full') return true;
    const visibleTo = parseJsonValue<string[] | null>(message.visible_to, null);
    if (visibleTo === null) return true;
    return visibleTo.some((characterId) => viewerCharacterIds.includes(characterId));
  });

  const messages = sortMessages(filteredMessages.map((m, idx) => {
    const storyTime = parseJsonValue<StoryTime | null>(m.story_time, null);
    const metadata = parseJsonValue<Record<string, any> | null>(m.metadata, null);

    return {
      seq: idx + 1,
      scene_id: m.scene_id,
      scene_name: m.scene_name,
      story_time: storyTime,
      speaker: m.sender_char_name ?? m.sender_nickname ?? 'unknown',
      type: normalizeMessageType(m.message_type),
      content: m.content,
      dice_result: metadata?.dice_expression
        ? {
            expression: metadata.dice_expression,
            total: metadata.dice_total ?? 0,
            detail: metadata.dice_detail ?? '',
          }
        : undefined,
    };
  }), sort_strategy);

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

  if (format === 'json') return serializeILF(doc);
  if (format === 'text') return ilfToSimpleText(doc);
  return ilfToPlainText(doc);
}
