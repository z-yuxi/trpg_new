/**
 * outline-extractor.ts
 * 从 TipTap ProseMirror JSON 文档中提取大纲条目（纯函数）
 */
import type { ModuleOutlineItem } from '@trpg/shared';

const BLOCK_NAME_KEY: Record<string, string> = {
  scene_block:  'scene_name',
  npc_block:    'npc_name',
  event_block:  'event_name',
  clue_block:   'clue_name',
  check_block:  'check_name',
  dialog_block: 'dialog_title',
};

const BUSINESS_BLOCK_TYPES = new Set(Object.keys(BLOCK_NAME_KEY));

/**
 * 遍历 TipTap doc JSON，提取标题节点 + 业务块节点构成大纲
 * @param docJson  TipTap getJSON() 返回的对象，或其 JSON 字符串
 */
export function extractOutline(docJson: unknown): ModuleOutlineItem[] {
  const items: ModuleOutlineItem[] = [];
  let doc: { content?: unknown[] };

  if (typeof docJson === 'string') {
    try { doc = JSON.parse(docJson); } catch { return []; }
  } else {
    doc = (docJson ?? {}) as typeof doc;
  }

  walkNodes(doc.content ?? [], items);
  return items;
}

function walkNodes(nodes: unknown[], items: ModuleOutlineItem[]) {
  for (const raw of nodes) {
    const node = raw as Record<string, any>;
    if (!node || typeof node.type !== 'string') continue;

    if (node.type === 'heading') {
      const text = flattenText(node.content);
      if (text) {
        items.push({
          id: `heading-${items.length}`,
          type: 'heading',
          label: text,
          level: node.attrs?.level ?? 1,
        });
      }
    } else if (BUSINESS_BLOCK_TYPES.has(node.type)) {
      const blockType = node.type.replace('_block', '') as ModuleOutlineItem['type'];
      const nameKey = BLOCK_NAME_KEY[node.type]!;
      const label: string = node.attrs?.[nameKey] || `未命名${blockType}`;
      items.push({
        id: node.attrs?.id || `block-${items.length}`,
        type: blockType,
        label,
      });
    }

    // 递归子内容（如容器节点）
    if (Array.isArray(node.content)) {
      walkNodes(node.content, items);
    }
  }
}

function flattenText(content: unknown[]): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
    .map((c: any) => c.text as string)
    .join('');
}
