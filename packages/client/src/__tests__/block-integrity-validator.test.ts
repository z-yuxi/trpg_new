import { describe, it, expect } from 'vitest';
import { validateBlockIntegrity, extractBlocks } from '../utils/block-integrity-validator';

// ── 辅助构造器 ──────────────────────────────────────────
function makeDoc(...nodes: object[]) {
  return { type: 'doc', content: nodes };
}
function sceneBlock(id: string, connections: { target_scene_block_id: string }[] = []) {
  return { type: 'scene_block', attrs: { id, scene_name: `场景-${id}`, connections } };
}
function npcBlock(id: string, name: string) {
  return { type: 'npc_block', attrs: { id, npc_name: name } };
}
function eventBlock(id: string, checkId: string | null = null) {
  return { type: 'event_block', attrs: { id, event_name: `事件-${id}`, associated_check_block_id: checkId } };
}
function clueBlock(id: string, sceneId: string | null = null) {
  return { type: 'clue_block', attrs: { id, clue_name: `线索-${id}`, associated_scene_block_id: sceneId } };
}
function checkBlock(id: string) {
  return { type: 'check_block', attrs: { id, check_name: `检定-${id}` } };
}
function dialogBlock(id: string, participants: { name: string; type: string }[] = []) {
  return { type: 'dialog_block', attrs: { id, dialog_title: `对话-${id}`, participants } };
}

// ────────────────────────────────────────────────────────
describe('block-integrity-validator', () => {
  describe('extractBlocks', () => {
    it('空文档应返回空数组', () => {
      expect(extractBlocks(makeDoc())).toEqual([]);
    });

    it('识别场景块和 NPC 块', () => {
      const doc = makeDoc(sceneBlock('s1'), npcBlock('n1', '陈晨'));
      const blocks = extractBlocks(doc);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]!.type).toBe('scene');
      expect(blocks[1]!.type).toBe('npc');
    });
  });

  describe('validateBlockIntegrity', () => {
    it('所有引用合法时，结果 ok = true', () => {
      const doc = makeDoc(
        sceneBlock('s1', [{ target_scene_block_id: 's2' }]),
        sceneBlock('s2'),
        checkBlock('c1'),
        eventBlock('e1', 'c1'),
        clueBlock('cl1', 's1'),
        npcBlock('n1', '守卫'),
        dialogBlock('d1', [{ name: '守卫', type: 'npc' }]),
      );
      const result = validateBlockIntegrity(doc);
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('场景块引用不存在的场景 ID，应产生 error', () => {
      const doc = makeDoc(
        sceneBlock('s1', [{ target_scene_block_id: 'NONEXISTENT' }]),
      );
      const result = validateBlockIntegrity(doc);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatchObject({
        block_type: 'scene',
        field: 'connections.target_scene_block_id',
        ref_id: 'NONEXISTENT',
      });
    });

    it('事件块引用不存在的检定块 ID，应产生 error', () => {
      const doc = makeDoc(eventBlock('e1', 'NO_CHECK'));
      const result = validateBlockIntegrity(doc);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatchObject({
        block_type: 'event',
        field: 'associated_check_block_id',
        ref_id: 'NO_CHECK',
      });
    });

    it('线索块引用不存在的场景 ID，应产生 error', () => {
      const doc = makeDoc(clueBlock('cl1', 'NO_SCENE'));
      const result = validateBlockIntegrity(doc);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatchObject({
        block_type: 'clue',
        field: 'associated_scene_block_id',
      });
    });

    it('对话块中 NPC 参与者不存在对应 NPC 块，应产生 error', () => {
      const doc = makeDoc(
        dialogBlock('d1', [{ name: '幽灵NPC', type: 'npc' }]),
      );
      const result = validateBlockIntegrity(doc);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatchObject({
        block_type: 'dialog',
        field: 'participants',
      });
    });

    it('对话块中 pc 类型参与者不受 NPC 校验约束', () => {
      const doc = makeDoc(
        dialogBlock('d1', [{ name: '玩家A', type: 'pc' }]),
      );
      const result = validateBlockIntegrity(doc);
      expect(result.ok).toBe(true);
    });

    it('null/空 associated_scene_block_id 不触发校验错误', () => {
      const doc = makeDoc(clueBlock('cl1', null));
      const result = validateBlockIntegrity(doc);
      expect(result.ok).toBe(true);
    });

    it('多项错误时 errors 数组长度匹配', () => {
      const doc = makeDoc(
        sceneBlock('s1', [{ target_scene_block_id: 'X' }]),
        eventBlock('e1', 'Y'),
      );
      const result = validateBlockIntegrity(doc);
      expect(result.errors.length).toBe(2);
    });

    it('接受 JSON 字符串输入', () => {
      const doc = makeDoc(sceneBlock('s1'));
      const result = validateBlockIntegrity(JSON.stringify(doc));
      expect(result.ok).toBe(true);
    });
  });
});
