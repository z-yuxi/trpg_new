/**
 * ILF – Immersive Log Format
 * 一种专为 TRPG 跑团记录设计的纯文本/结构化双模格式。
 * 可在游戏内导出完整对话日志，也可序列化为可读排版文档。
 */

import type { StoryTime } from '../types';

// ─── 接口定义 ────────────────────────────────────────────────────────────────

export interface ILFMetadata {
  version: '1.0';
  campaign_title: string;
  rule_system: string;
  export_at: string; // ISO 8601
  author?: string;
}

export interface ILFMessage {
  seq: number;
  scene_id: string;
  scene_name: string;
  story_time: StoryTime | null;
  speaker: string;
  type: 'dialogue' | 'narration' | 'dice' | 'system' | 'ooc';
  content: string;
  dice_result?: {
    expression: string;
    total: number;
    detail: string;
  };
}

export interface ILFScene {
  id: string;
  name: string;
  description?: string;
  messages: ILFMessage[];
}

export interface ILFCampaign {
  metadata: ILFMetadata;
  players: { character_id: string; character_name: string; player_name: string }[];
  scenes: ILFScene[];
}

export interface ILFDocument {
  campaign: ILFCampaign;
}

// ─── 构建 ─────────────────────────────────────────────────────────────────────

/**
 * 将原始数据组装为 ILFDocument。
 */
export function buildILFDocument(params: {
  campaignTitle: string;
  ruleSystem: string;
  author?: string;
  players: ILFCampaign['players'];
  scenes: Omit<ILFScene, 'messages'>[];
  messages: ILFMessage[];
}): ILFDocument {
  const sceneMap = new Map<string, ILFScene>();
  for (const s of params.scenes) {
    sceneMap.set(s.id, { ...s, messages: [] });
  }
  for (const msg of params.messages) {
    const scene = sceneMap.get(msg.scene_id);
    if (scene) {
      scene.messages.push(msg);
    } else {
      // 未知场景自动创建
      const newScene: ILFScene = { id: msg.scene_id, name: msg.scene_name, messages: [msg] };
      sceneMap.set(msg.scene_id, newScene);
    }
  }
  return {
    campaign: {
      metadata: {
        version: '1.0',
        campaign_title: params.campaignTitle,
        rule_system: params.ruleSystem,
        export_at: new Date().toISOString(),
        author: params.author,
      },
      players: params.players,
      scenes: Array.from(sceneMap.values()),
    },
  };
}

// ─── 序列化 ───────────────────────────────────────────────────────────────────

/**
 * 将 ILFDocument 序列化为 JSON 字符串（带 2 格缩进）。
 */
export function serializeILF(doc: ILFDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * 从 JSON 字符串反序列化 ILFDocument。
 */
export function deserializeILF(raw: string): ILFDocument {
  const doc = JSON.parse(raw) as ILFDocument;
  if (!doc.campaign?.metadata?.version) {
    throw new Error('Invalid ILF document: missing metadata.version');
  }
  return doc;
}

/**
 * 将 ILFDocument 转换为人类可读的纯文本/Markdown 格式。
 */
export function ilfToPlainText(doc: ILFDocument): string {
  const { metadata, players, scenes } = doc.campaign;
  const lines: string[] = [];

  lines.push(`# ${metadata.campaign_title}`);
  lines.push(`**规则系统**: ${metadata.rule_system}`);
  lines.push(`**导出时间**: ${metadata.export_at}`);
  if (metadata.author) lines.push(`**作者**: ${metadata.author}`);
  lines.push('');

  if (players.length > 0) {
    lines.push('## 参与者');
    for (const p of players) {
      lines.push(`- **${p.player_name}** 扮演 ${p.character_name}`);
    }
    lines.push('');
  }

  for (const scene of scenes) {
    lines.push(`## 场景：${scene.name}`);
    if (scene.description) lines.push(`> ${scene.description}`);
    lines.push('');

    for (const msg of scene.messages) {
      const timeStr = msg.story_time ? `[${formatStoryTime(msg.story_time)}] ` : '';
      switch (msg.type) {
        case 'dialogue':
          lines.push(`${timeStr}**${msg.speaker}**: ${msg.content}`);
          break;
        case 'narration':
          lines.push(`${timeStr}*${msg.content}*`);
          break;
        case 'dice':
          {
            const dr = msg.dice_result;
            const detail = dr ? ` (${dr.expression} = ${dr.total})` : '';
            lines.push(`${timeStr}🎲 **${msg.speaker}** 掷骰${detail}: ${msg.content}`);
          }
          break;
        case 'system':
          lines.push(`${timeStr}〔系统〕${msg.content}`);
          break;
        case 'ooc':
          lines.push(`${timeStr}(OOC) **${msg.speaker}**: ${msg.content}`);
          break;
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 将故事时间格式化为可读字符串。
 */
export function formatStoryTime(st: StoryTime): string {
  const day = `D${st.day}`;
  const hour = String(st.hour).padStart(2, '0');
  const minute = String(st.minute).padStart(2, '0');
  return `${day} ${hour}:${minute}`;
}
