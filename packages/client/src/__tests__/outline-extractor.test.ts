import { describe, it, expect } from 'vitest';
import { extractOutline } from '../utils/outline-extractor';

// ── 辅助构造器 ──────────────────────────────────────────
function makeDoc(...nodes: object[]) {
  return { type: 'doc', content: nodes };
}
function heading(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}
function sceneBlock(id: string, name: string) {
  return { type: 'scene_block', attrs: { id, scene_name: name } };
}
function npcBlock(id: string, name: string) {
  return { type: 'npc_block', attrs: { id, npc_name: name } };
}
function checkBlock(id: string, name: string) {
  return { type: 'check_block', attrs: { id, check_name: name } };
}

// ────────────────────────────────────────────────────────
describe('outline-extractor', () => {
  it('空文档应返回空数组', () => {
    expect(extractOutline({ type: 'doc', content: [] })).toEqual([]);
  });

  it('空字符串 / 非法 JSON 应返回空数组', () => {
    expect(extractOutline('')).toEqual([]);
    expect(extractOutline('not json')).toEqual([]);
  });

  it('H1/H2 各一个时，大纲含 2 个 heading 条目', () => {
    const doc = makeDoc(heading(1, '序章'), heading(2, '第一幕'));
    const items = extractOutline(doc);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'heading', label: '序章', level: 1 });
    expect(items[1]).toMatchObject({ type: 'heading', label: '第一幕', level: 2 });
  });

  it('场景块和 NPC 块各一个时，大纲含 2 个业务块条目', () => {
    const doc = makeDoc(
      sceneBlock('s1', '废弃工厂'),
      npcBlock('n1', '侦探陈晨'),
    );
    const items = extractOutline(doc);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ type: 'scene', label: '废弃工厂', id: 's1' });
    expect(items[1]).toMatchObject({ type: 'npc',   label: '侦探陈晨', id: 'n1' });
  });

  it('H1 + 场景块 + 检定块 混合文档，大纲节点数正确', () => {
    const doc = makeDoc(
      heading(1, '开篇'),
      sceneBlock('s1', '港口码头'),
      checkBlock('c1', '侦察检定'),
    );
    const items = extractOutline(doc);
    expect(items).toHaveLength(3);
    expect(items.map(i => i.type)).toEqual(['heading', 'scene', 'check']);
  });

  it('接受 JSON 字符串输入', () => {
    const doc = makeDoc(heading(1, '标题'));
    const items = extractOutline(JSON.stringify(doc));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'heading', label: '标题' });
  });

  it('没有 id 的块应生成 fallback id', () => {
    const doc = makeDoc({ type: 'scene_block', attrs: { scene_name: '无ID场景' } });
    const items = extractOutline(doc);
    expect(items[0]!.id).toBeTruthy();
  });

  it('check_block 的 label 来自 check_name', () => {
    const doc = makeDoc({ type: 'check_block', attrs: { id: 'c1', check_name: '力量检定' } });
    const items = extractOutline(doc);
    expect(items[0]).toMatchObject({ type: 'check', label: '力量检定' });
  });

  it('dialog_block 的 label 来自 dialog_title', () => {
    const doc = makeDoc({ type: 'dialog_block', attrs: { id: 'd1', dialog_title: '审讯对话' } });
    const items = extractOutline(doc);
    expect(items[0]).toMatchObject({ type: 'dialog', label: '审讯对话' });
  });
});
