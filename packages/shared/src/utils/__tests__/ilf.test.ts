import { describe, it, expect } from 'vitest';
import {
  buildILFDocument,
  serializeILF,
  deserializeILF,
  ilfToPlainText,
  formatStoryTime,
} from '../ilf';
import type { ILFMessage } from '../ilf';

const mockStoryTime = { day: 1, hour: 14, minute: 30 };

const mockMessages: ILFMessage[] = [
  {
    seq: 1,
    scene_id: 'scene-1',
    scene_name: '旅馆大堂',
    story_time: mockStoryTime,
    speaker: '李明',
    type: 'dialogue',
    content: '我想要一杯咖啡。',
  },
  {
    seq: 2,
    scene_id: 'scene-1',
    scene_name: '旅馆大堂',
    story_time: mockStoryTime,
    speaker: 'KP',
    type: 'narration',
    content: '大堂里弥漫着烟草的气味。',
  },
  {
    seq: 3,
    scene_id: 'scene-1',
    scene_name: '旅馆大堂',
    story_time: mockStoryTime,
    speaker: '李明',
    type: 'dice',
    content: '失败了',
    dice_result: { expression: '1d100', total: 87, detail: '[87]' },
  },
  {
    seq: 4,
    scene_id: 'scene-2',
    scene_name: '走廊',
    story_time: { day: 1, hour: 15, minute: 0 },
    speaker: '系统',
    type: 'system',
    content: '进入新场景：走廊',
  },
];

describe('ILF - buildILFDocument', () => {
  it('应按 scene_id 分组消息', () => {
    const doc = buildILFDocument({
      campaignTitle: '暗夜行动',
      ruleSystem: 'CoC 7',
      players: [{ character_id: 'c1', character_name: '李明', player_name: '张三' }],
      scenes: [
        { id: 'scene-1', name: '旅馆大堂' },
        { id: 'scene-2', name: '走廊' },
      ],
      messages: mockMessages,
    });
    expect(doc.campaign.scenes).toHaveLength(2);
    expect(doc.campaign.scenes[0].messages).toHaveLength(3);
    expect(doc.campaign.scenes[1].messages).toHaveLength(1);
  });

  it('metadata 应包含正确字段', () => {
    const doc = buildILFDocument({
      campaignTitle: '暗夜行动',
      ruleSystem: 'CoC 7',
      author: '测试者',
      players: [],
      scenes: [],
      messages: [],
    });
    expect(doc.campaign.metadata.version).toBe('1.0');
    expect(doc.campaign.metadata.campaign_title).toBe('暗夜行动');
    expect(doc.campaign.metadata.rule_system).toBe('CoC 7');
    expect(doc.campaign.metadata.author).toBe('测试者');
    expect(typeof doc.campaign.metadata.export_at).toBe('string');
  });

  it('未知场景应自动创建', () => {
    const doc = buildILFDocument({
      campaignTitle: '测试',
      ruleSystem: 'DnD',
      players: [],
      scenes: [], // 不预定义场景
      messages: mockMessages,
    });
    expect(doc.campaign.scenes.length).toBeGreaterThan(0);
    expect(doc.campaign.scenes.find(s => s.id === 'scene-1')).toBeDefined();
  });
});

describe('ILF - serializeILF / deserializeILF', () => {
  it('应序列化为 JSON 字符串', () => {
    const doc = buildILFDocument({
      campaignTitle: '暗夜行动',
      ruleSystem: 'CoC 7',
      players: [],
      scenes: [{ id: 'scene-1', name: '旅馆大堂' }],
      messages: mockMessages.slice(0, 1),
    });
    const json = serializeILF(doc);
    expect(json).toBeTypeOf('string');
    expect(JSON.parse(json)).toBeDefined();
  });

  it('往返反序列化后数据应一致', () => {
    const doc = buildILFDocument({
      campaignTitle: '暗夜行动',
      ruleSystem: 'CoC 7',
      players: [],
      scenes: [{ id: 'scene-1', name: '旅馆大堂' }],
      messages: mockMessages.slice(0, 3),
    });
    const json = serializeILF(doc);
    const parsed = deserializeILF(json);
    expect(parsed.campaign.metadata.campaign_title).toBe('暗夜行动');
    expect(parsed.campaign.scenes[0].messages).toHaveLength(3);
  });

  it('无效 JSON 应抛出错误', () => {
    expect(() => deserializeILF('not-json')).toThrow();
  });

  it('缺少 version 字段应抛出错误', () => {
    expect(() => deserializeILF(JSON.stringify({ campaign: { metadata: {} } }))).toThrow();
  });
});

describe('ILF - ilfToPlainText', () => {
  it('应生成包含标题的 Markdown', () => {
    const doc = buildILFDocument({
      campaignTitle: '暗夜行动',
      ruleSystem: 'CoC 7',
      players: [{ character_id: 'c1', character_name: '李明', player_name: '张三' }],
      scenes: [{ id: 'scene-1', name: '旅馆大堂' }],
      messages: mockMessages,
    });
    const text = ilfToPlainText(doc);
    expect(text).toContain('# 暗夜行动');
    expect(text).toContain('CoC 7');
    expect(text).toContain('张三');
    expect(text).toContain('旅馆大堂');
  });

  it('对话消息应以粗体角色名开头', () => {
    const doc = buildILFDocument({
      campaignTitle: 'T',
      ruleSystem: 'X',
      players: [],
      scenes: [{ id: 'scene-1', name: '场景' }],
      messages: [mockMessages[0]],
    });
    const text = ilfToPlainText(doc);
    expect(text).toContain('**李明**');
    expect(text).toContain('我想要一杯咖啡。');
  });

  it('旁白消息应用斜体', () => {
    const doc = buildILFDocument({
      campaignTitle: 'T',
      ruleSystem: 'X',
      players: [],
      scenes: [{ id: 'scene-1', name: '场景' }],
      messages: [mockMessages[1]],
    });
    const text = ilfToPlainText(doc);
    expect(text).toContain('*大堂里弥漫着烟草的气味。*');
  });

  it('骰子消息应包含骰子图标', () => {
    const doc = buildILFDocument({
      campaignTitle: 'T',
      ruleSystem: 'X',
      players: [],
      scenes: [{ id: 'scene-1', name: '场景' }],
      messages: [mockMessages[2]],
    });
    const text = ilfToPlainText(doc);
    expect(text).toContain('🎲');
    expect(text).toContain('1d100');
  });
});

describe('ILF - formatStoryTime', () => {
  it('应格式化为 Dx HH:MM', () => {
    expect(formatStoryTime({ day: 1, hour: 9, minute: 5 })).toBe('D1 09:05');
    expect(formatStoryTime({ day: 3, hour: 14, minute: 30 })).toBe('D3 14:30');
  });
});
