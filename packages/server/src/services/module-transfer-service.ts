import fs from 'fs';
import fontkit from '@pdf-lib/fontkit';
import mammoth from 'mammoth';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export interface ModuleImportPreview {
  name: string;
  description: string;
  content: string;
  plain_text: string;
  word_count: number;
}

export interface ModulePdfSource {
  name: string;
  description?: string;
  content?: string | null;
}

const TXT_EXTENSIONS = new Set(['.txt', '.md']);
const DOCX_EXTENSIONS = new Set(['.docx']);
const WINDOWS_CJK_FONT_CANDIDATES = [
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/msyh.ttf',
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/simsun.ttc',
];

function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function sanitizeFileStem(fileName: string): string {
  const ext = getExtension(fileName);
  const stem = ext ? fileName.slice(0, -ext.length) : fileName;
  return stem.replace(/[\\/_-]+/g, ' ').trim() || '未命名模组';
}

function normalizePlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countMeaningfulText(text: string): number {
  return text.replace(/\s+/g, '').length;
}

function paragraphNode(text: string) {
  return {
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : [],
  };
}

function headingNode(level: 1 | 2 | 3, text: string) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

export function buildTipTapDocFromPlainText(text: string): string {
  const normalized = normalizePlainText(text);
  const lines = normalized ? normalized.split('\n') : [];
  const content = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith('### ')) return headingNode(3, line.slice(4).trim());
      if (line.startsWith('## ')) return headingNode(2, line.slice(3).trim());
      if (line.startsWith('# ')) return headingNode(1, line.slice(2).trim());
      return paragraphNode(line);
    });

  if (content.length === 0) {
    content.push(paragraphNode(''));
  }

  return JSON.stringify({
    type: 'doc',
    content,
  });
}

function summarizeText(text: string): string {
  const firstParagraph = normalizePlainText(text)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('#'));

  if (!firstParagraph) return '';
  return firstParagraph.length > 120 ? `${firstParagraph.slice(0, 120)}...` : firstParagraph;
}

function inferTitle(fileName: string, text: string): string {
  const firstHeading = normalizePlainText(text)
    .split('\n')
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+/.test(line));

  if (firstHeading) {
    return firstHeading.replace(/^#{1,3}\s+/, '').trim() || sanitizeFileStem(fileName);
  }

  return sanitizeFileStem(fileName);
}

export async function importModuleFile(fileName: string, mimeType: string, buffer: Buffer): Promise<ModuleImportPreview> {
  const extension = getExtension(fileName);
  let plainText = '';

  if (TXT_EXTENSIONS.has(extension) || mimeType.startsWith('text/')) {
    plainText = buffer.toString('utf8');
  } else if (
    DOCX_EXTENSIONS.has(extension) ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    plainText = result.value;
  } else {
    throw new Error('仅支持 .txt、.md、.docx 文件');
  }

  const normalized = normalizePlainText(plainText);
  const name = inferTitle(fileName, normalized);

  return {
    name,
    description: summarizeText(normalized),
    content: buildTipTapDocFromPlainText(normalized),
    plain_text: normalized,
    word_count: countMeaningfulText(normalized),
  };
}

function collectTextFromNode(node: Record<string, any>, lines: string[]) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'text' && typeof node.text === 'string') {
    lines.push(node.text);
    return;
  }

  if (node.type === 'heading') {
    const text = flattenText(node.content ?? []);
    if (text) lines.push(text);
    return;
  }

  if (node.type === 'paragraph') {
    const text = flattenText(node.content ?? []);
    lines.push(text);
    return;
  }

  const nameFieldMap: Record<string, string> = {
    scene_block: 'scene_name',
    npc_block: 'npc_name',
    event_block: 'event_name',
    clue_block: 'clue_name',
    check_block: 'check_name',
    dialog_block: 'dialog_title',
  };

  const nameField = nameFieldMap[node.type as string];
  if (nameField) {
    const value = node.attrs?.[nameField];
    if (typeof value === 'string' && value.trim()) {
      lines.push(value.trim());
    }
  }

  if (Array.isArray(node.content)) {
    node.content.forEach((child: Record<string, any>) => collectTextFromNode(child, lines));
  }
}

function flattenText(nodes: unknown[]): string {
  const chunks: string[] = [];
  nodes.forEach((node) => collectTextFromNode(node as Record<string, any>, chunks));
  return chunks.join('').trim();
}

export function extractPlainTextFromModuleContent(content: string | null | undefined): string {
  if (!content) return '';

  try {
    const doc = JSON.parse(content) as { content?: Record<string, any>[] };
    const lines: string[] = [];
    (doc.content ?? []).forEach((node) => collectTextFromNode(node, lines));
    return lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const result: string[] = [];
  for (const originalLine of text.split('\n')) {
    const line = originalLine.trimEnd();
    if (!line) {
      result.push('');
      continue;
    }
    let cursor = 0;
    while (cursor < line.length) {
      result.push(line.slice(cursor, cursor + maxCharsPerLine));
      cursor += maxCharsPerLine;
    }
  }
  return result;
}

export async function createModulePdfBuffer(moduleSource: ModulePdfSource): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let currentPage = pdfDoc.addPage([595.28, 841.89]);
  const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fallbackTitleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cjkFontPath = WINDOWS_CJK_FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  const fontBytes = cjkFontPath ? fs.readFileSync(cjkFontPath) : null;
  const font = fontBytes ? await pdfDoc.embedFont(fontBytes) : fallbackFont;
  const titleFont = fontBytes ? font : fallbackTitleFont;

  const plainText = extractPlainTextFromModuleContent(moduleSource.content);
  const bodyLines = wrapText(
    [moduleSource.description?.trim() ?? '', plainText].filter(Boolean).join('\n\n'),
    34,
  );

  let y = 800;
  currentPage.drawText(moduleSource.name || '未命名模组', {
    x: 48,
    y,
    size: 20,
    font: titleFont,
  });

  y -= 28;
  currentPage.drawText('TRPG 模组导出', {
    x: 48,
    y,
    size: 10,
    font,
  });

  y -= 24;
  for (const line of bodyLines) {
    if (y < 48) {
      y = 800;
      currentPage = pdfDoc.addPage([595.28, 841.89]);
      currentPage.setFont(font);
      currentPage.drawText(moduleSource.name || '未命名模组', {
        x: 48,
        y,
        size: 16,
        font: titleFont,
      });
      y -= 28;
    }

    currentPage.drawText(line || ' ', {
      x: 48,
      y,
      size: 11,
      font,
      lineHeight: 16,
    });
    y -= 16;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}