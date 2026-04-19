/**
 * block-integrity-validator.ts
 * 模组内业务块引用完整性校验（纯函数，前后端共用）
 *
 * 规则：
 * - 场景块的 connections[].target_scene_block_id → 必须存在对应场景块
 * - 事件块的 associated_check_block_id         → 必须存在对应检定块
 * - 线索块的 associated_scene_block_id         → 必须存在对应场景块
 * - 对话块的 participants[].type==='npc' 的 name → 必须匹配某个 NPC 块的 npc_name
 */

export type BlockType = 'scene' | 'npc' | 'event' | 'clue' | 'check' | 'dialog';

export interface BlockRef {
  id: string;
  type: BlockType;
  attrs: Record<string, any>;
}

export interface ValidationError {
  block_id: string;
  block_type: BlockType;
  field: string;
  message: string;
  ref_id?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

/** 从 TipTap doc JSON 中抽取所有业务块 */
export function extractBlocks(docJson: unknown): BlockRef[] {
  const blocks: BlockRef[] = [];
  let doc: { content?: unknown[] };

  if (typeof docJson === 'string') {
    try { doc = JSON.parse(docJson); } catch { return []; }
  } else {
    doc = (docJson ?? {}) as typeof doc;
  }

  walkForBlocks(doc.content ?? [], blocks);
  return blocks;
}

function walkForBlocks(nodes: unknown[], blocks: BlockRef[]) {
  for (const raw of nodes) {
    const node = raw as Record<string, any>;
    if (!node || typeof node.type !== 'string') continue;

    const typeMap: Record<string, BlockType> = {
      scene_block: 'scene',
      npc_block:   'npc',
      event_block: 'event',
      clue_block:  'clue',
      check_block: 'check',
      dialog_block:'dialog',
    };

    if (typeMap[node.type]) {
      blocks.push({ id: node.attrs?.id ?? '', type: typeMap[node.type]!, attrs: node.attrs ?? {} });
    }

    if (Array.isArray(node.content)) walkForBlocks(node.content, blocks);
  }
}

/**
 * 校验整个文档的块引用完整性
 * @param docJson TipTap doc JSON（对象或字符串）
 */
export function validateBlockIntegrity(docJson: unknown): ValidationResult {
  const blocks = extractBlocks(docJson);
  const errors: ValidationError[] = [];

  // 建立各类型块的 id → attrs 映射
  const byType = new Map<BlockType, Map<string, Record<string, any>>>();
  for (const b of blocks) {
    if (!byType.has(b.type)) byType.set(b.type, new Map());
    if (b.id) byType.get(b.type)!.set(b.id, b.attrs);
  }

  // NPC 块按 npc_name 索引（对话块用名称匹配，不用 id）
  const npcNames = new Set(
    blocks.filter(b => b.type === 'npc').map(b => (b.attrs['npc_name'] as string) || '')
  );
  const sceneIds = byType.get('scene') ?? new Map();
  const checkIds = byType.get('check') ?? new Map();

  for (const b of blocks) {
    switch (b.type) {
      case 'scene': {
        const connections: any[] = b.attrs['connections'] ?? [];
        for (const conn of connections) {
          const tgt = conn.target_scene_block_id as string;
          if (tgt && !sceneIds.has(tgt)) {
            errors.push({
              block_id: b.id,
              block_type: 'scene',
              field: 'connections.target_scene_block_id',
              message: `连接目标场景 ID "${tgt}" 不存在`,
              ref_id: tgt,
            });
          }
        }
        break;
      }
      case 'event': {
        const refId = b.attrs['associated_check_block_id'] as string | null;
        if (refId && !checkIds.has(refId)) {
          errors.push({
            block_id: b.id,
            block_type: 'event',
            field: 'associated_check_block_id',
            message: `关联检定块 ID "${refId}" 不存在`,
            ref_id: refId,
          });
        }
        break;
      }
      case 'clue': {
        const refId = b.attrs['associated_scene_block_id'] as string | null;
        if (refId && !sceneIds.has(refId)) {
          errors.push({
            block_id: b.id,
            block_type: 'clue',
            field: 'associated_scene_block_id',
            message: `关联场景块 ID "${refId}" 不存在`,
            ref_id: refId,
          });
        }
        break;
      }
      case 'dialog': {
        const participants: any[] = b.attrs['participants'] ?? [];
        for (const p of participants) {
          if (p.type === 'npc' && p.name && !npcNames.has(p.name)) {
            errors.push({
              block_id: b.id,
              block_type: 'dialog',
              field: 'participants',
              message: `对话参与者 NPC "${p.name}" 不存在对应 NPC 块`,
            });
          }
        }
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
