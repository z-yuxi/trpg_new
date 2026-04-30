/**
 * character-pdf-service.ts
 * 生成角色卡 PDF（会员权益 export_pdf）
 */
import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { CharacterSheet } from '@trpg/shared';

const CHARS_PER_LINE = 34;
const WINDOWS_CJK_FONT_CANDIDATES = [
  path.resolve(__dirname, '../../assets/fonts/NotoSansSC.ttf'),
  'C:/Windows/Fonts/simhei.ttf',
  'C:/Windows/Fonts/msyh.ttf',
  'C:/Windows/Fonts/msyh.ttc',
  'C:/Windows/Fonts/simsun.ttc',
];

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    let cursor = 0;
    while (cursor < raw.length) {
      lines.push(raw.slice(cursor, cursor + maxChars));
      cursor += maxChars;
    }
    if (raw.length === 0) lines.push('');
  }
  return lines;
}

export async function createCharacterPdfBuffer(sheet: CharacterSheet): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fallbackBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const cjkFontPath = WINDOWS_CJK_FONT_CANDIDATES.find((p) => fs.existsSync(p));
  const fontBytes = cjkFontPath ? fs.readFileSync(cjkFontPath) : null;
  const bodyFont = fontBytes ? await pdfDoc.embedFont(fontBytes, { subset: true }) : fallbackFont;
  const titleFont = fontBytes ? bodyFont : fallbackBold;

  // ── 辅助：换页 ────────────────────────────────────────────────────────────
  let page = pdfDoc.addPage([595.28, 841.89]);
  let y = 800;

  function ensureLine(lines = 1) {
    if (y < 48 + lines * 16) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 800;
    }
  }

  function drawText(text: string, size: number, font = bodyFont, indent = 48) {
    ensureLine();
    page.drawText(text || ' ', { x: indent, y, size, font });
    y -= size + 6;
  }

  function drawDivider() {
    ensureLine();
    page.drawLine({ start: { x: 48, y }, end: { x: 547, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 10;
  }

  function drawSection(title: string) {
    ensureLine(2);
    y -= 6;
    drawDivider();
    drawText(title, 13, titleFont);
  }

  // ── 标题区 ───────────────────────────────────────────────────────────────
  drawText(sheet.name || '未命名角色', 20, titleFont);
  drawText(`角色卡  /  ${sheet.ruleset_id}`, 10);
  drawText(`导出时间：${new Date().toISOString().slice(0, 10)}`, 9);
  y -= 8;
  drawDivider();

  // ── 属性区 ───────────────────────────────────────────────────────────────
  const attrs = Object.entries(sheet.attributes ?? {});
  if (attrs.length > 0) {
    drawSection('属性值');
    const colW = 120;
    const cols = 4;
    let col = 0;
    let rowY = y;
    for (const [k, v] of attrs) {
      const x = 48 + col * colW;
      ensureLine();
      page.drawText(`${k}: ${v}`, { x, y: rowY, size: 11, font: bodyFont });
      col++;
      if (col >= cols) { col = 0; rowY -= 18; ensureLine(); y = rowY; }
    }
    if (col > 0) { y = rowY - 18; }
    y -= 4;
  }

  // ── 派生值区 ─────────────────────────────────────────────────────────────
  const derived = Object.entries(sheet.derived_max ?? {});
  if (derived.length > 0) {
    drawSection('派生属性');
    for (const [k, v] of derived) {
      drawText(`${k}  初始 ${v.max}  / 当前 ${v.current}`, 11);
    }
  }

  // ── 技能区 ───────────────────────────────────────────────────────────────
  const skills = Object.entries(sheet.skills ?? {});
  if (skills.length > 0) {
    drawSection('技能');
    const colW = 180;
    const cols = 3;
    let col = 0;
    let rowY = y;
    for (const [k, v] of skills) {
      const x = 48 + col * colW;
      ensureLine();
      page.drawText(`${k}: ${v}%`, { x, y: rowY, size: 10, font: bodyFont });
      col++;
      if (col >= cols) { col = 0; rowY -= 16; ensureLine(); y = rowY; }
    }
    if (col > 0) { y = rowY - 16; }
    y -= 4;
  }

  // ── 装备区 ───────────────────────────────────────────────────────────────
  if ((sheet.equipment ?? []).length > 0) {
    drawSection('装备');
    for (const item of sheet.equipment) {
      drawText(`• ${item}`, 10);
    }
  }

  // ── 背景故事 ─────────────────────────────────────────────────────────────
  if (sheet.background?.trim()) {
    drawSection('背景故事');
    for (const line of wrap(sheet.background, CHARS_PER_LINE)) {
      drawText(line, 10);
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
