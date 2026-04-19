/**
 * BlockViews.spec.ts
 * 6 种业务块 NodeView 组件冒烟测试（折叠态渲染不崩溃）
 *
 * TipTap NodeViewWrapper / NodeViewContent 在 jsdom 中作为 global stub 注入，
 * 避免对真实 TipTap 运行时的依赖。
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// ── Stubs ──────────────────────────────────────────────────────────────
const NodeViewWrapper = defineComponent({
  name: 'NodeViewWrapper',
  setup(_p, { slots }) { return () => h('div', { class: 'nvw' }, slots.default?.()); },
});
const NodeViewContent = defineComponent({
  name: 'NodeViewContent',
  setup() { return () => h('div', { class: 'nvc' }); },
});

const globalStubs = {
  global: {
    stubs: { NodeViewWrapper, NodeViewContent },
  },
};

function fakeNode(attrs: Record<string, any> = {}) {
  return { attrs: { id: 'test-id', collapsed: true, ...attrs } };
}
const noop = vi.fn();

// ── Block View imports ─────────────────────────────────────────────────
import SceneBlockView from '../components/module-editor/blocks/SceneBlockView.vue';
import NpcBlockView from '../components/module-editor/blocks/NpcBlockView.vue';
import EventBlockView from '../components/module-editor/blocks/EventBlockView.vue';
import ClueBlockView from '../components/module-editor/blocks/ClueBlockView.vue';
import CheckBlockView from '../components/module-editor/blocks/CheckBlockView.vue';
import DialogBlockView from '../components/module-editor/blocks/DialogBlockView.vue';

// ── Tests ──────────────────────────────────────────────────────────────
describe('场景块 SceneBlockView', () => {
  it('折叠态渲染不崩溃', () => {
    expect(() => {
      const w = mount(SceneBlockView, {
        props: { node: fakeNode({ scene_name: '测试场景', scene_type: 'spatial' }), updateAttributes: noop, deleteNode: noop },
        ...globalStubs,
      });
      expect(w.text()).toContain('测试场景');
      w.unmount();
    }).not.toThrow();
  });
});

describe('NPC 块 NpcBlockView', () => {
  it('折叠态渲染不崩溃', () => {
    expect(() => {
      const w = mount(NpcBlockView, {
        props: { node: fakeNode({ npc_name: '老约翰' }), updateAttributes: noop, deleteNode: noop },
        ...globalStubs,
      });
      expect(w.text()).toContain('老约翰');
      w.unmount();
    }).not.toThrow();
  });
});

describe('事件块 EventBlockView', () => {
  it('折叠态渲染不崩溃', () => {
    expect(() => {
      const w = mount(EventBlockView, {
        props: { node: fakeNode({ event_name: '图书馆遭遇', difficulty: 'normal', branches: [] }), updateAttributes: noop, deleteNode: noop },
        ...globalStubs,
      });
      expect(w.text()).toContain('图书馆遭遇');
      w.unmount();
    }).not.toThrow();
  });
});

describe('线索块 ClueBlockView', () => {
  it('折叠态渲染不崩溃', () => {
    expect(() => {
      const w = mount(ClueBlockView, {
        props: { node: fakeNode({ clue_name: '血迹', clue_type: 'physical' }), updateAttributes: noop, deleteNode: noop },
        ...globalStubs,
      });
      expect(w.text()).toContain('血迹');
      w.unmount();
    }).not.toThrow();
  });
});

describe('检定块 CheckBlockView', () => {
  it('折叠态渲染不崩溃', () => {
    expect(() => {
      const w = mount(CheckBlockView, {
        props: { node: fakeNode({ check_name: '侦查检定', skill_or_attribute: '侦查' }), updateAttributes: noop, deleteNode: noop },
        ...globalStubs,
      });
      expect(w.text()).toContain('侦查检定');
      w.unmount();
    }).not.toThrow();
  });
});

describe('对话块 DialogBlockView', () => {
  it('折叠态渲染不崩溃', () => {
    expect(() => {
      const w = mount(DialogBlockView, {
        props: { node: fakeNode({ dialog_title: '与警察的对话', participants: [], lines: [] }), updateAttributes: noop, deleteNode: noop },
        ...globalStubs,
      });
      expect(w.text()).toContain('与警察的对话');
      w.unmount();
    }).not.toThrow();
  });
});
