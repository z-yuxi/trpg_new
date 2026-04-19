import { describe, expect, it } from 'vitest';
import {
  buildTipTapDocFromPlainText,
  createModulePdfBuffer,
  extractPlainTextFromModuleContent,
  importModuleFile,
} from '../services/module-transfer-service';

describe('module-transfer-service', () => {
  it('把纯文本转换为 TipTap 文档', () => {
    const content = buildTipTapDocFromPlainText('# 序章\n第一段\n\n## 第二幕\n第二段');
    const doc = JSON.parse(content);

    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(4);
    expect(doc.content[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(doc.content[1]).toMatchObject({ type: 'paragraph' });
    expect(doc.content[2]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
  });

  it('从 txt 文件生成导入预览', async () => {
    const preview = await importModuleFile(
      'lost-town.txt',
      'text/plain',
      Buffer.from('# 失落小镇\n雾气覆盖了街道。', 'utf8'),
    );

    expect(preview.name).toBe('失落小镇');
    expect(preview.description).toContain('雾气覆盖了街道');
    expect(preview.word_count).toBeGreaterThan(0);

    const doc = JSON.parse(preview.content);
    expect(doc.content[0]).toMatchObject({ type: 'heading' });
  });

  it('从 TipTap 文档提取纯文本', () => {
    const text = extractPlainTextFromModuleContent(JSON.stringify({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '标题' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '正文第一段' }] },
        { type: 'scene_block', attrs: { scene_name: '码头' } },
      ],
    }));

    expect(text).toBe('标题\n正文第一段\n码头');
  });

  it('生成非空 pdf buffer', async () => {
    const buffer = await createModulePdfBuffer({
      name: '测试模组',
      description: '导出描述',
      content: JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '这是导出正文。' }] }],
      }),
    });

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});