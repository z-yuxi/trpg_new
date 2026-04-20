import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { db } from '../db';
import {
  buildILFDocument,
  serializeILF,
  type ILFMessage,
  type ILFScene,
  type StoryTime,
} from '@trpg/shared';

export type LogPerspective = 'my' | 'full' | 'scene';
export type LogSortStrategy = 'strict' | 'scene_first' | 'main_interleave';
export type LogExportFormat = 'pdf' | 'md' | 'txt' | 'ilf';

export interface ExportCampaignLogOptions {
  campaignId: string;
  perspective: LogPerspective;
  sort: LogSortStrategy;
  format: LogExportFormat;
  requesterId: string;
  sceneIds?: string[];
  includeOoc?: boolean;
  includeSystem?: boolean;
  includeDiceDetails?: boolean;
  simulateUserId?: string;
  previewLimit?: number;
}

export interface ExportCampaignLogResult {
  body: string | Buffer;
  contentType: string;
  fileName: string;
  previewText: string;
  totalMessages: number;
}

interface CampaignRow {
  id: string;
  name: string;
  ruleset_id: string | null;
  gm_user_id: string;
}

interface SceneRow {
  id: string;
  name: string;
  type: string | null;
  description: string | null;
}

interface ViewerCharacterRow {
  id: string;
  name: string;
}

interface RawMessageRow {
  id: string;
  scene_id: string | null;
  scene_name: string | null;
  scene_type: string | null;
  story_time: string | StoryTime | null;
  created_at: Date | string;
  sender_nickname: string | null;
  sender_char_name: string | null;
  message_type: string;
  content: string;
  metadata: string | Record<string, unknown> | null;
  visible_to: string | string[] | null;
}

interface ExportMessage {
  id: string;
  seq: bigint;
  sceneId: string;
  sceneName: string;
  sceneType: string;
  sceneDescription: string;
  storyTime: StoryTime | null;
  createdAt: Date;
  speaker: string;
  type: string;
  content: string;
  metadata: Record<string, unknown> | null;
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

function toSeq(id: string): bigint {
  try {
    return BigInt(id);
  } catch {
    return BigInt(0);
  }
}

function storyTimeToNumber(storyTime: StoryTime | null): number | null {
  if (!storyTime) return null;
  return ((storyTime.day - 1) * 1440) + (storyTime.hour * 60) + storyTime.minute;
}

function formatStoryTime(storyTime: StoryTime | null): string {
  if (!storyTime) return '无故事时间';
  return `第${storyTime.day}日 ${String(storyTime.hour).padStart(2, '0')}:${String(storyTime.minute).padStart(2, '0')}`;
}

function formatClock(date: Date): string {
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sanitizeFileName(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, '_');
}

function buildFileName(title: string, format: LogExportFormat): string {
  const ext = format === 'pdf' ? 'pdf' : format === 'md' ? 'md' : format === 'txt' ? 'txt' : 'ilf';
  return `${sanitizeFileName(title)}.${ext}`;
}

function buildTitle(params: {
  perspective: LogPerspective;
  campaignName: string;
  viewerCharacters: ViewerCharacterRow[];
  selectedScenes: SceneRow[];
}): string {
  if (params.perspective === 'full') return `${params.campaignName} 完整剧本`;
  if (params.perspective === 'scene') {
    if (params.selectedScenes.length === 1) return `${params.campaignName} - ${params.selectedScenes[0]!.name}`;
    return `${params.campaignName} 场景剧本`;
  }
  return `${params.viewerCharacters[0]?.name ?? '观察者'} 的故事 - ${params.campaignName}`;
}

function isVisibleToViewer(visibleTo: string[] | null, userId: string, characterIds: string[]): boolean {
  if (visibleTo === null) return true;
  if (visibleTo.includes('*')) return true;
  if (visibleTo.includes(userId)) return true;
  return visibleTo.some((id) => characterIds.includes(id));
}

function normalizeMessageType(type: string): ILFMessage['type'] {
  if (type === 'dialogue' || type === 'narration' || type === 'dice' || type === 'system' || type === 'ooc') {
    return type;
  }
  if (type === 'announcement') return 'system';
  return 'narration';
}

function resolveMessageContent(message: RawMessageRow, metadata: Record<string, unknown> | null, includeDiceDetails: boolean): string {
  if (message.message_type === 'clue_card') {
    const clueTitle = typeof metadata?.['title'] === 'string' ? metadata['title'] : '未命名线索';
    const clueContent = typeof metadata?.['content'] === 'string' ? metadata['content'] : message.content;
    return `线索《${clueTitle}》\n${clueContent}`;
  }

  if (message.message_type === 'dice') {
    const rolls = Array.isArray(metadata?.['dice_rolls']) ? metadata['dice_rolls'] as Array<Record<string, unknown>> : [];
    const result = typeof metadata?.['result'] === 'string' ? metadata['result'] : message.content;
    if (!includeDiceDetails || rolls.length === 0) return result;
    const details = rolls.map((roll) => {
      const expr = typeof roll['expression'] === 'string' ? roll['expression'] : 'dice';
      const value = String(roll['value'] ?? '?');
      const detail = typeof roll['detail'] === 'string' && roll['detail'] ? ` (${roll['detail']})` : '';
      return `${expr}=${value}${detail}`;
    }).join('；');
    return `${result}\n骰子明细：${details}`;
  }

  return message.content;
}

function sortExportMessages(messages: ExportMessage[], strategy: LogSortStrategy): ExportMessage[] {
  const strictSorted = [...messages].sort((left, right) => {
    if (left.seq === right.seq) return 0;
    return left.seq < right.seq ? -1 : 1;
  });

  if (strategy === 'scene_first') {
    return strictSorted.sort((left, right) => {
      if (left.sceneName === right.sceneName) {
        if (left.seq === right.seq) return 0;
        return left.seq < right.seq ? -1 : 1;
      }
      return left.sceneName.localeCompare(right.sceneName, 'zh-CN');
    });
  }

  if (strategy === 'main_interleave') {
    const buckets = new Map<string, ExportMessage[]>();
    const bucketOrder: string[] = [];

    for (const message of strictSorted) {
      const storyBucket = storyTimeToNumber(message.storyTime);
      const bucketKey = storyBucket !== null ? `story:${storyBucket}` : `clock:${Math.floor(message.createdAt.getTime() / 60000)}`;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, []);
        bucketOrder.push(bucketKey);
      }
      buckets.get(bucketKey)!.push(message);
    }

    return bucketOrder.flatMap((bucketKey) => {
      const bucket = buckets.get(bucketKey) ?? [];
      return bucket.sort((left, right) => {
        const leftWeight = left.sceneType === 'virtual' ? 1 : 0;
        const rightWeight = right.sceneType === 'virtual' ? 1 : 0;
        if (leftWeight !== rightWeight) return leftWeight - rightWeight;
        if (left.seq === right.seq) return 0;
        return left.seq < right.seq ? -1 : 1;
      });
    });
  }

  return strictSorted;
}

function toILFMessages(messages: ExportMessage[], includeDiceDetails: boolean): ILFMessage[] {
  return messages.map((message, index) => {
    const diceRolls = Array.isArray(message.metadata?.['dice_rolls'])
      ? message.metadata?.['dice_rolls'] as Array<Record<string, unknown>>
      : [];

    return {
      seq: index + 1,
      scene_id: message.sceneId,
      scene_name: message.sceneName,
      story_time: message.storyTime,
      speaker: message.speaker,
      type: normalizeMessageType(message.type),
      content: message.content,
      dice_result: includeDiceDetails && diceRolls[0]
        ? {
            expression: String(diceRolls[0]['expression'] ?? 'dice'),
            total: Number(diceRolls[0]['value'] ?? 0),
            detail: String(diceRolls[0]['detail'] ?? ''),
          }
        : undefined,
    };
  });
}

function renderMarkdownMessage(message: ExportMessage): string[] {
  const timeLabel = message.storyTime ? formatStoryTime(message.storyTime) : formatClock(message.createdAt);
  if (message.type === 'dice') {
    return [`[${timeLabel}] [🎲 ${message.speaker}]`, '```text', message.content, '```', ''];
  }
  if (message.type === 'system' || message.type === 'announcement') {
    return [`[${timeLabel}] > ${message.content}`, ''];
  }
  if (message.type === 'ooc') {
    return [`[${timeLabel}] (OOC) **${message.speaker}**：${message.content}`, ''];
  }
  return [`[${timeLabel}] **${message.speaker}**：${message.content}`, ''];
}

function renderMarkdownDocument(params: {
  title: string;
  campaignName: string;
  ruleSystem: string;
  perspective: LogPerspective;
  messages: ExportMessage[];
}): string {
  const lines: string[] = [
    `# ${params.title}`,
    `**团名**: ${params.campaignName}`,
    `**规则系统**: ${params.ruleSystem}`,
    `**导出时间**: ${new Date().toISOString()}`,
    '',
  ];

  let currentSceneId = '';
  for (const message of params.messages) {
    if (params.perspective === 'scene' || currentSceneId !== message.sceneId) {
      currentSceneId = message.sceneId;
      lines.push(`## ${message.sceneName}`);
      lines.push('');
    }
    lines.push(...renderMarkdownMessage(message));
  }

  return lines.join('\n');
}

function renderTextDocument(params: {
  title: string;
  campaignName: string;
  perspective: LogPerspective;
  messages: ExportMessage[];
}): string {
  const lines: string[] = [params.title, `团名: ${params.campaignName}`, `导出时间: ${new Date().toISOString()}`, ''];
  let currentSceneId = '';
  for (const message of params.messages) {
    if (params.perspective === 'scene' || currentSceneId !== message.sceneId) {
      currentSceneId = message.sceneId;
      lines.push(`== ${message.sceneName} ==`);
    }
    const timeLabel = message.storyTime ? formatStoryTime(message.storyTime) : formatClock(message.createdAt);
    lines.push(`[${timeLabel}] ${message.speaker}: ${message.content}`);
  }
  return lines.join('\n');
}

function buildPreviewText(messages: ExportMessage[], title: string, maxLines = 100): string {
  const lines: string[] = [`# ${title}`, ''];
  for (const message of messages) {
    if (lines.length >= maxLines) break;
    const timeLabel = message.storyTime ? formatStoryTime(message.storyTime) : formatClock(message.createdAt);
    lines.push(`[${timeLabel}] ${message.sceneName} / ${message.speaker}`);
    lines.push(message.content);
    lines.push('');
  }
  return lines.join('\n');
}

function splitWrappedLines(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const char of paragraph) {
      const next = current + char;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = char;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function drawWrappedText(params: {
  page: PDFPage;
  font: PDFFont;
  fontSize: number;
  color: ReturnType<typeof rgb>;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  center?: boolean;
}): number {
  const lines = splitWrappedLines(params.text, params.font, params.fontSize, params.maxWidth);
  let nextY = params.y;
  for (const line of lines) {
    const width = params.font.widthOfTextAtSize(line, params.fontSize);
    const drawX = params.center ? params.x + ((params.maxWidth - width) / 2) : params.x;
    params.page.drawText(line, {
      x: drawX,
      y: nextY,
      size: params.fontSize,
      font: params.font,
      color: params.color,
    });
    nextY -= params.lineHeight;
  }
  return nextY;
}

async function loadPdfFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  const fontPath = path.resolve(__dirname, '../../assets/fonts/NotoSansSC.ttf');
  if (fs.existsSync(fontPath)) {
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = fs.readFileSync(fontPath);
    return pdfDoc.embedFont(fontBytes, { subset: true });
  }
  return pdfDoc.embedFont(StandardFonts.Helvetica);
}

async function renderPdfDocument(params: {
  title: string;
  campaignName: string;
  ruleSystem: string;
  perspective: LogPerspective;
  messages: ExportMessage[];
  scenes: SceneRow[];
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await loadPdfFont(pdfDoc);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 52;

  let page = pdfDoc.addPage(pageSize);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  drawWrappedText({
    page,
    font,
    fontSize: 24,
    color: rgb(0.14, 0.14, 0.18),
    text: params.title,
    x: margin,
    y: pageHeight - 120,
    maxWidth: pageWidth - margin * 2,
    lineHeight: 30,
    center: true,
  });
  drawWrappedText({
    page,
    font,
    fontSize: 12,
    color: rgb(0.45, 0.45, 0.5),
    text: `${params.campaignName} / ${params.ruleSystem} / ${new Date().toLocaleString('zh-CN')}`,
    x: margin,
    y: pageHeight - 176,
    maxWidth: pageWidth - margin * 2,
    lineHeight: 18,
    center: true,
  });

  page = pdfDoc.addPage(pageSize);
  let y = page.getHeight() - 60;
  y = drawWrappedText({
    page,
    font,
    fontSize: 18,
    color: rgb(0.15, 0.15, 0.18),
    text: '目录',
    x: margin,
    y,
    maxWidth: pageWidth - margin * 2,
    lineHeight: 24,
  });
  y -= 12;
  params.scenes.forEach((scene, index) => {
    y = drawWrappedText({
      page,
      font,
      fontSize: 11,
      color: rgb(0.28, 0.28, 0.32),
      text: `${index + 1}. ${scene.name}`,
      x: margin,
      y,
      maxWidth: pageWidth - margin * 2,
      lineHeight: 16,
    });
  });

  page = pdfDoc.addPage(pageSize);
  y = page.getHeight() - 56;
  let currentSceneId = '';

  const ensureSpace = (needed: number) => {
    if (y - needed > 42) return;
    page = pdfDoc.addPage(pageSize);
    y = page.getHeight() - 56;
  };

  for (const message of params.messages) {
    if (params.perspective === 'scene' || currentSceneId !== message.sceneId) {
      currentSceneId = message.sceneId;
      ensureSpace(28);
      y = drawWrappedText({
        page,
        font,
        fontSize: 16,
        color: rgb(0.14, 0.14, 0.18),
        text: message.sceneName,
        x: margin,
        y,
        maxWidth: pageWidth - margin * 2,
        lineHeight: 22,
      });
      y -= 6;
    }

    const prefix = message.storyTime ? `[${formatStoryTime(message.storyTime)}]` : `[${formatClock(message.createdAt)}]`;
    const body = message.type === 'dice'
      ? `[DICE ${message.speaker}] ${message.content}`
      : `${prefix} ${message.speaker} ${message.content}`;
    const fontSize = message.type === 'system' ? 10.5 : 11.5;
    const lineHeight = 16;
    const lines = splitWrappedLines(body, font, fontSize, pageWidth - margin * 2);
    ensureSpace((lines.length * lineHeight) + 8);
    y = drawWrappedText({
      page,
      font,
      fontSize,
      color: message.type === 'ooc' ? rgb(0.5, 0.5, 0.55) : rgb(0.16, 0.16, 0.18),
      text: body,
      x: margin,
      y,
      maxWidth: pageWidth - margin * 2,
      lineHeight,
      center: message.type === 'system',
    });
    y -= 6;
  }

  return Buffer.from(await pdfDoc.save());
}

async function checkPermission(campaignId: string, userId: string): Promise<boolean> {
  const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
  if (!campaign) return false;
  if (campaign.gm_user_id === userId) return true;

  const state = await db('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .where({ 'css.campaign_id': campaignId, 'cs.user_id': userId })
    .first();
  return !!state;
}

export async function exportCampaignLog(options: ExportCampaignLogOptions): Promise<ExportCampaignLogResult> {
  const includeOoc = options.includeOoc ?? true;
  const includeSystem = options.includeSystem ?? true;
  const includeDiceDetails = options.includeDiceDetails ?? true;

  const allowed = await checkPermission(options.campaignId, options.requesterId);
  if (!allowed) throw Object.assign(new Error('Forbidden'), { status: 403 });

  const campaign = await db('campaigns')
    .where({ id: options.campaignId })
    .select('id', 'name', 'ruleset_id', 'gm_user_id')
    .first() as CampaignRow | undefined;
  if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });

  const isRequesterGm = campaign.gm_user_id === options.requesterId;
  if (options.perspective === 'full' && !isRequesterGm) {
    throw Object.assign(new Error('只有 GM 可以导出完整剧本'), { status: 403 });
  }
  if (options.simulateUserId && !isRequesterGm) {
    throw Object.assign(new Error('只有 GM 可以模拟玩家视角导出'), { status: 403 });
  }

  const effectiveUserId = options.simulateUserId ?? options.requesterId;
  const viewerCharacters = await db('character_scene_states as css')
    .join('character_sheets as cs', 'cs.id', 'css.character_id')
    .where({ 'css.campaign_id': options.campaignId, 'cs.user_id': effectiveUserId })
    .select('cs.id', 'cs.name')
    .catch(() => [] as ViewerCharacterRow[]);
  const viewerCharacterIds = viewerCharacters.map((row) => row.id);

  let sceneQuery = db('scenes').where({ campaign_id: options.campaignId });
  if (options.sceneIds && options.sceneIds.length > 0) {
    sceneQuery = sceneQuery.whereIn('id', options.sceneIds);
  }
  const sceneRows = await sceneQuery.select('id', 'name', 'type', 'description') as SceneRow[];
  const sceneMap = new Map(sceneRows.map((scene) => [scene.id, scene]));

  let messageQuery = db('chat_messages as cm')
    .leftJoin('scenes as s', 's.id', 'cm.scene_id')
    .leftJoin('users as u', 'u.id', 'cm.sender_user_id')
    .leftJoin('character_sheets as cs', 'cs.id', 'cm.sender_character_id')
    .where('cm.campaign_id', options.campaignId)
    .orderBy('cm.id', 'asc')
    .select(
      'cm.id',
      'cm.scene_id',
      's.name as scene_name',
      's.type as scene_type',
      'cm.story_time',
      'cm.created_at',
      'u.nickname as sender_nickname',
      'cs.name as sender_char_name',
      'cm.message_type',
      'cm.content',
      'cm.metadata',
      'cm.visible_to',
    );
  if (options.sceneIds && options.sceneIds.length > 0) {
    messageQuery = messageQuery.whereIn('cm.scene_id', options.sceneIds);
  }
  const rawMessages = await messageQuery.catch(() => [] as RawMessageRow[]);

  const filteredMessages = rawMessages
    .filter((row) => {
      const metadata = parseJsonValue<Record<string, unknown> | null>(row.metadata, null);
      const visibleTo = parseJsonValue<string[] | null>(row.visible_to, null);
      const gmHidden = Boolean(metadata?.['gm_hidden']);

      if (options.perspective === 'full') return true;
      if (gmHidden) return false;
      return isVisibleToViewer(visibleTo, effectiveUserId, viewerCharacterIds);
    })
    .map((row) => {
      const metadata = parseJsonValue<Record<string, unknown> | null>(row.metadata, null);
      const scene = row.scene_id ? sceneMap.get(row.scene_id) : undefined;
      return {
        id: row.id,
        seq: toSeq(row.id),
        sceneId: row.scene_id ?? 'unknown-scene',
        sceneName: row.scene_name ?? scene?.name ?? '未指定场景',
        sceneType: row.scene_type ?? scene?.type ?? 'spatial',
        sceneDescription: scene?.description ?? '',
        storyTime: parseJsonValue<StoryTime | null>(row.story_time, null),
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        speaker: row.sender_char_name ?? row.sender_nickname ?? (row.message_type === 'system' ? '系统' : '未知角色'),
        type: row.message_type,
        content: resolveMessageContent(row, metadata, includeDiceDetails),
        metadata,
      } satisfies ExportMessage;
    })
    .filter((message) => includeOoc || message.type !== 'ooc')
    .filter((message) => includeSystem || (message.type !== 'system' && message.type !== 'announcement'));

  const sortedMessages = sortExportMessages(filteredMessages, options.sort);
  const selectedScenes = sceneRows.length > 0
    ? sceneRows
    : Array.from(new Map(sortedMessages.map((message) => [message.sceneId, {
      id: message.sceneId,
      name: message.sceneName,
      type: message.sceneType,
      description: message.sceneDescription,
    }])).values());

  const title = buildTitle({
    perspective: options.perspective,
    campaignName: campaign.name,
    viewerCharacters,
    selectedScenes,
  });
  const previewText = buildPreviewText(sortedMessages, title, options.previewLimit ?? 100);

  if (options.format === 'ilf') {
    const ilfDoc = buildILFDocument({
      campaignTitle: title,
      ruleSystem: campaign.ruleset_id ?? 'Unknown',
      players: viewerCharacters.map((character) => ({
        character_id: character.id,
        character_name: character.name,
        player_name: effectiveUserId,
      })),
      scenes: selectedScenes.map((scene): Omit<ILFScene, 'messages'> => ({
        id: scene.id,
        name: scene.name,
        description: scene.description ?? undefined,
      })),
      messages: toILFMessages(sortedMessages, includeDiceDetails),
    });
    return {
      body: serializeILF(ilfDoc),
      contentType: 'application/json; charset=utf-8',
      fileName: buildFileName(title, 'ilf'),
      previewText,
      totalMessages: sortedMessages.length,
    };
  }

  if (options.format === 'md') {
    return {
      body: renderMarkdownDocument({
        title,
        campaignName: campaign.name,
        ruleSystem: campaign.ruleset_id ?? 'Unknown',
        perspective: options.perspective,
        messages: sortedMessages,
      }),
      contentType: 'text/markdown; charset=utf-8',
      fileName: buildFileName(title, 'md'),
      previewText,
      totalMessages: sortedMessages.length,
    };
  }

  if (options.format === 'txt') {
    return {
      body: renderTextDocument({
        title,
        campaignName: campaign.name,
        perspective: options.perspective,
        messages: sortedMessages,
      }),
      contentType: 'text/plain; charset=utf-8',
      fileName: buildFileName(title, 'txt'),
      previewText,
      totalMessages: sortedMessages.length,
    };
  }

  return {
    body: await renderPdfDocument({
      title,
      campaignName: campaign.name,
      ruleSystem: campaign.ruleset_id ?? 'Unknown',
      perspective: options.perspective,
      messages: sortedMessages,
      scenes: selectedScenes,
    }),
    contentType: 'application/pdf',
    fileName: buildFileName(title, 'pdf'),
    previewText,
    totalMessages: sortedMessages.length,
  };
}
