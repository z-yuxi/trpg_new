/**
 * outline-extractor.ts
 * 从 TipTap ProseMirror JSON 文档中提取大纲条目（纯函数）
 */
import type { ModuleOutlineItem } from '@trpg/shared';

// 旧块类型映射（兼容旧格式文档）
const LEGACY_BLOCK_NAME_KEY: Record<string, string> = {
  scene_block:  'scene_name',
  npc_block:    'npc_name',
  event_block:  'event_name',
  clue_block:   'clue_name',
  check_block:  'check_name',
  dialog_block: 'dialog_title',
};

const LEGACY_BLOCK_TYPES = new Set(Object.keys(LEGACY_BLOCK_NAME_KEY));

/**
 * 从 TipTap doc JSON 中提取所有可见纯文本内容，段落间以换行分隔。
 * 用于将编辑器内容转换为 AI 可分析的纯文本输入。
 *
 * @param docJson  TipTap getJSON() 返回的对象，或其 JSON 字符串，或纯字符串
 */
export function extractDocumentPlainText(docJson: unknown): string {
  if (typeof docJson === 'string') {
    // 尝试解析为 TipTap JSON；若失败则视作纯文本直接返回
    try {
      const parsed = JSON.parse(docJson) as { content?: unknown[] };
      if (parsed && typeof parsed === 'object' && 'content' in parsed) {
        const parts: string[] = [];
        walkForText(parsed.content ?? [], parts);
        return parts.join('\n');
      }
    } catch { /* 非 JSON，按纯文本处理 */ }
    return docJson;
  }
  const doc = (docJson ?? {}) as { content?: unknown[] };
  const parts: string[] = [];
  walkForText(doc.content ?? [], parts);
  return parts.join('\n');
}

function walkForText(nodes: unknown[], out: string[]) {
  for (const raw of nodes) {
    const node = raw as Record<string, any>;
    if (!node || typeof node.type !== 'string') continue;
    if (node.type === 'text' && typeof node.text === 'string') {
      out.push(node.text);
    }
    if (Array.isArray(node.content)) {
      walkForText(node.content, out);
    }
  }
}

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

  walkNodes(doc.content ?? [], items, 0);
  return items;
}

function walkNodes(nodes: unknown[], items: ModuleOutlineItem[], depth: number) {
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
    } else if (node.type === 'investigable_node') {
      const label: string = node.attrs?.label || '未命名调查节点';
      const hasContent = Array.isArray(node.content) && node.content.some(
        (c: any) => c?.type !== 'paragraph' || flattenText(c.content).length > 0,
      );
      items.push({
        id: node.attrs?.id || `inv-${items.length}`,
        type: 'investigable',
        label,
        depth,
        hasContent,
      });
      // 递归子内容（嵌套调查节点）
      if (Array.isArray(node.content)) {
        walkNodes(node.content, items, depth + 1);
      }
      continue;
    } else if (node.type === 'kp_info') {
      items.push({
        id: node.attrs?.id || `kp-${items.length}`,
        type: 'kp_info',
        label: '☆ KP 信息',
        depth,
      });
    } else if (node.type === 'branch_node') {
      items.push({
        id: node.attrs?.id || `branch-${items.length}`,
        type: 'branch',
        label: node.attrs?.condition ? `▸ ${node.attrs.condition}` : '▸ 条件分支',
        depth,
      });
      if (Array.isArray(node.content)) {
        walkNodes(node.content, items, depth + 1);
      }
      continue;
    } else if (node.type === 'consequence_hint') {
      items.push({
        id: node.attrs?.id || `conseq-${items.length}`,
        type: 'consequence',
        label: node.attrs?.condition ? `▶ ${node.attrs.condition}` : '▶ 后果提示',
        depth,
      });
    } else if (node.type === 'player_handout') {
      const label: string = node.attrs?.label || '玩家资料';
      items.push({
        id: node.attrs?.id || `handout-${items.length}`,
        type: 'handout',
        label: `【】${label}`,
        depth,
      });
    } else if (LEGACY_BLOCK_TYPES.has(node.type)) {
      // 兼容旧格式文档
      const blockType = node.type.replace('_block', '') as ModuleOutlineItem['type'];
      const nameKey = LEGACY_BLOCK_NAME_KEY[node.type]!;
      const label: string = node.attrs?.[nameKey] || `未命名${blockType}`;
      items.push({
        id: node.attrs?.id || `block-${items.length}`,
        type: blockType,
        label,
      });
    }

    // 递归子内容（非 investigable_node 避免二次递归）
    if (Array.isArray(node.content) && node.type !== 'investigable_node') {
      walkNodes(node.content, items, depth);
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
