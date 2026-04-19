/**
 * RuleCanvas.spec.ts
 * RuleCanvas 组件冒烟测试：验证三栏布局正常渲染
 *
 * 注意：VueFlow 内部依赖 ResizeObserver 等浏览器 API，
 * jsdom 中可能不完整，所以这里主要测试：
 * 1. 组件能挂载不报错
 * 2. 三栏结构（原子库、画布区、工具栏）存在于 DOM 中
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import RuleCanvas from '../components/rule-canvas/RuleCanvas.vue';

// VueFlow 内部使用 ResizeObserver，jsdom 中需 mock
beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
  // VueFlow 可能用到 DOMMatrix
  if (!global.DOMMatrix) {
    global.DOMMatrix = vi.fn().mockImplementation(() => ({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    })) as any;
  }
});

describe('RuleCanvas 组件冒烟测试', () => {
  it('应能成功挂载（无运行时报错）', () => {
    const wrapper = mount(RuleCanvas, {
      props: { rulesetId: 'test-rs-001' },
      global: {
        stubs: {
          // Stub VueFlow 相关组件，避免 DOM API 依赖问题
          VueFlow: { template: '<div class="vue-flow-stub"><slot/></div>' },
          Background: true,
          MiniMap: true,
          Controls: true,
          Panel: { template: '<div><slot/></div>' },
        },
      },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('应渲染工具栏', () => {
    const wrapper = mount(RuleCanvas, {
      props: { rulesetId: 'test-rs-001' },
      global: {
        stubs: {
          VueFlow: { template: '<div class="vue-flow-stub"><slot/></div>' },
          Background: true,
          MiniMap: true,
          Controls: true,
          Panel: { template: '<div><slot/></div>' },
        },
      },
    });
    // 工具栏应存在
    expect(wrapper.find('.rule-canvas__toolbar').exists()).toBe(true);
    // 撤销/重做按钮
    expect(wrapper.text()).toContain('撤销');
    expect(wrapper.text()).toContain('重做');
  });

  it('应渲染三栏布局（原子库 + 画布 + body）', () => {
    const wrapper = mount(RuleCanvas, {
      props: { rulesetId: 'test-rs-001' },
      global: {
        stubs: {
          VueFlow: { template: '<div class="vue-flow-stub"><slot/></div>' },
          Background: true,
          MiniMap: true,
          Controls: true,
          Panel: { template: '<div><slot/></div>' },
        },
      },
    });
    // 三栏容器
    expect(wrapper.find('.rule-canvas__body').exists()).toBe(true);
    expect(wrapper.find('.rule-canvas__sidebar').exists()).toBe(true);
    expect(wrapper.find('.rule-canvas__flow').exists()).toBe(true);
    // 原子库组件应在侧边栏中
    expect(wrapper.findComponent({ name: 'AtomLibrary' }).exists()).toBe(true);
  });

  it('点击"预览执行"按钮应显示预览面板', async () => {
    const wrapper = mount(RuleCanvas, {
      props: { rulesetId: 'test-rs-001' },
      global: {
        stubs: {
          VueFlow: { template: '<div class="vue-flow-stub"><slot/></div>' },
          Background: true,
          MiniMap: true,
          Controls: true,
          Panel: { template: '<div><slot/></div>' },
        },
      },
    });
    // 初始无预览面板
    expect(wrapper.find('.rule-canvas__props').exists()).toBe(false);
    // 点击"预览执行"
    const previewBtn = wrapper.findAll('.toolbar-btn').find((b) => b.text().includes('预览执行'));
    expect(previewBtn).toBeDefined();
    await previewBtn!.trigger('click');
    // 面板应出现
    expect(wrapper.find('.rule-canvas__props').exists()).toBe(true);
  });
});
