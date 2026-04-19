/**
 * Batch 4: useBlockRegistry 可组合函数单元测试
 *
 * 测试编辑器块注册表的核心行为：注册、分组、刷新。
 * 使用 withSetup 在 Vue 组件上下文内运行，避免生命周期警告。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { useBlockRegistry } from '../composables/useBlockRegistry';
import type { Editor } from '@tiptap/core';

// ── 辅助工具 ────────────────────────────────────────────────────

/** 在真实组件上下文中运行 setup，返回 [结果, wrapper] */
function withSetup<T>(setup: () => T): [T, ReturnType<typeof mount>] {
  let result!: T;
  const Wrapper = defineComponent({
    setup() { result = setup(); return {}; },
    template: '<div/>',
  });
  const wrapper = mount(Wrapper);
  return [result, wrapper];
}

/** 构造一个只需要 getJSON / on / off 的最小 Editor mock */
function makeMockEditor(docJson: Record<string, any> = { type: 'doc', content: [] }) {
  const listeners: Map<string, (() => void)[]> = new Map();
  const mock = {
    getJSON: vi.fn().mockReturnValue(docJson),
    on: vi.fn((event: string, handler: () => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    }),
    off: vi.fn(),
    /** 辅助方法：手动触发事件 */
    _trigger(event: string) {
      listeners.get(event)?.forEach(h => h());
    },
  };
  return mock;
}

// ── 样本文档 ────────────────────────────────────────────────────

const sampleDoc = {
  type: 'doc',
  content: [
    { type: 'scene_block',  attrs: { id: 's1', scene_name: '码头' } },
    { type: 'npc_block',    attrs: { id: 'n1', npc_name: '船长约翰' } },
    { type: 'dialog_block', attrs: { id: 'd1', dialog_title: '序幕对话' } },
    { type: 'scene_block',  attrs: { id: 's2', scene_name: '灯塔' } },
    { type: 'paragraph',    content: [{ type: 'text', text: '普通段落' }] },
  ],
};

// ── 测试 ──────────────────────────────────────────────────────

describe('useBlockRegistry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('editor 为 undefined 时注册表为空', () => {
    const editorRef = ref<Editor | undefined>(undefined);
    const [{ registry }] = withSetup(() => useBlockRegistry(editorRef as any));

    expect(registry.value).toHaveLength(0);
  });

  it('editor 初始化后立即扫描并填充注册表', () => {
    const mockEditor = makeMockEditor(sampleDoc);
    const editorRef = ref(mockEditor);

    const [{ registry }] = withSetup(() => useBlockRegistry(editorRef as any));

    // 4 个业务块（忽略 paragraph）
    expect(registry.value).toHaveLength(4);
    expect(registry.value[0]).toMatchObject({ id: 's1', type: 'scene_block', name: '码头' });
    expect(registry.value[2]).toMatchObject({ id: 'd1', type: 'dialog_block', name: '序幕对话' });
  });

  it('byType 按块类型正确分组', () => {
    const mockEditor = makeMockEditor(sampleDoc);
    const editorRef = ref(mockEditor);

    const [{ byType }] = withSetup(() => useBlockRegistry(editorRef as any));

    expect(byType.value['scene_block']).toHaveLength(2);
    expect(byType.value['npc_block']).toHaveLength(1);
    expect(byType.value['dialog_block']).toHaveLength(1);
    expect(byType.value['event_block']).toBeUndefined();
  });

  it('editor update 事件触发后注册表更新', () => {
    const initialDoc = { type: 'doc', content: [] };
    const mockEditor = makeMockEditor(initialDoc);
    const editorRef = ref(mockEditor);

    const [{ registry }] = withSetup(() => useBlockRegistry(editorRef as any));
    expect(registry.value).toHaveLength(0);

    // 模拟编辑器内容变化
    mockEditor.getJSON.mockReturnValue(sampleDoc);
    mockEditor._trigger('update');

    expect(registry.value).toHaveLength(4);
  });

  it('手动调用 refresh() 同步更新注册表', () => {
    const mockEditor = makeMockEditor({ type: 'doc', content: [] });
    const editorRef = ref(mockEditor);

    const [{ registry, refresh }] = withSetup(() => useBlockRegistry(editorRef as any));
    expect(registry.value).toHaveLength(0);

    mockEditor.getJSON.mockReturnValue(sampleDoc);
    refresh();

    expect(registry.value).toHaveLength(4);
  });

  it('未命名块使用默认名称 "未命名"', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'npc_block', attrs: { id: 'n2' } }, // 无 npc_name
      ],
    };
    const editorRef = ref(makeMockEditor(doc));

    const [{ registry }] = withSetup(() => useBlockRegistry(editorRef as any));

    expect(registry.value[0].name).toBe('未命名');
  });
});
