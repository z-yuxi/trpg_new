/**
 * useBlockRegistry.test.ts
 * 测试块注册表 composable：注册、重命名、删除后数量正确
 */
import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useBlockRegistry, type BlockRegistryEntry } from '../composables/useBlockRegistry';

/** 构造模拟 TipTap editor */
function makeMockEditor(doc: Record<string, any>) {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    getJSON: vi.fn().mockReturnValue(doc),
    on: (event: string, fn: () => void) => { (listeners[event] ??= []).push(fn); },
    off: (event: string, fn: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter(f => f !== fn);
    },
    _emit: (event: string) => { (listeners[event] ?? []).forEach(f => f()); },
  };
}

describe('useBlockRegistry', () => {
  it('从文档中提取块', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'scene_block', attrs: { id: 'scene-1', scene_name: '码头', collapsed: false }, content: [] },
        { type: 'npc_block', attrs: { id: 'npc-1', npc_name: '警察局长', collapsed: false }, content: [] },
        { type: 'paragraph', attrs: {}, content: [] },
      ],
    };
    const editor = makeMockEditor(doc);
    const editorRef = ref<any>(editor);
    const { registry } = useBlockRegistry(editorRef as any);
    await nextTick();
    expect(registry.value).toHaveLength(2);
    expect(registry.value.map((e: BlockRegistryEntry) => e.type)).toContain('scene_block');
    expect(registry.value.map((e: BlockRegistryEntry) => e.type)).toContain('npc_block');
  });

  it('文档更新后注册表同步', async () => {
    const doc1 = {
      type: 'doc',
      content: [
        { type: 'scene_block', attrs: { id: 'scene-1', scene_name: '码头', collapsed: false }, content: [] },
      ],
    };
    const editor = makeMockEditor(doc1);
    const editorRef = ref<any>(editor);
    const { registry } = useBlockRegistry(editorRef as any);
    await nextTick();
    expect(registry.value).toHaveLength(1);

    // 模拟文档变更（增加一个 NPC 块）
    const doc2 = {
      type: 'doc',
      content: [
        { type: 'scene_block', attrs: { id: 'scene-1', scene_name: '码头', collapsed: false }, content: [] },
        { type: 'npc_block', attrs: { id: 'npc-1', npc_name: '嫌疑人', collapsed: false }, content: [] },
      ],
    };
    editor.getJSON.mockReturnValue(doc2);
    editor._emit('update');
    await nextTick();
    expect(registry.value).toHaveLength(2);
  });

  it('删除块后注册表减少', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'scene_block', attrs: { id: 'scene-1', scene_name: '码头', collapsed: false }, content: [] },
        { type: 'npc_block', attrs: { id: 'npc-1', npc_name: '店主', collapsed: false }, content: [] },
      ],
    };
    const editor = makeMockEditor(doc);
    const editorRef = ref<any>(editor);
    const { registry } = useBlockRegistry(editorRef as any);
    await nextTick();
    expect(registry.value).toHaveLength(2);

    // 模拟删除 NPC 块
    editor.getJSON.mockReturnValue({
      type: 'doc',
      content: [
        { type: 'scene_block', attrs: { id: 'scene-1', scene_name: '码头', collapsed: false }, content: [] },
      ],
    });
    editor._emit('update');
    await nextTick();
    expect(registry.value).toHaveLength(1);
    expect(registry.value[0].type).toBe('scene_block');
  });

  it('byType 正确分组', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'scene_block', attrs: { id: 's1', scene_name: 'A', collapsed: false }, content: [] },
        { type: 'scene_block', attrs: { id: 's2', scene_name: 'B', collapsed: false }, content: [] },
        { type: 'npc_block', attrs: { id: 'n1', npc_name: 'C', collapsed: false }, content: [] },
      ],
    };
    const editor = makeMockEditor(doc);
    const editorRef = ref<any>(editor);
    const { byType } = useBlockRegistry(editorRef as any);
    await nextTick();
    expect(byType.value['scene_block']).toHaveLength(2);
    expect(byType.value['npc_block']).toHaveLength(1);
  });

  it('没有 id 的块不应被注册', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'scene_block', attrs: { id: '', scene_name: '无ID场景', collapsed: false }, content: [] },
        { type: 'npc_block', attrs: { id: 'n1', npc_name: '有ID', collapsed: false }, content: [] },
      ],
    };
    const editor = makeMockEditor(doc);
    const editorRef = ref<any>(editor);
    const { registry } = useBlockRegistry(editorRef as any);
    await nextTick();
    expect(registry.value).toHaveLength(1);
    expect(registry.value[0].id).toBe('n1');
  });
});
