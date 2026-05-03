import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import RuleRefView from '../blocks/RuleRefView.vue';

// rule_ref 是内联原子节点，用于引用规则检定/伤害/属性值
export const RuleRefExtension = Node.create({
  name: 'rule_ref',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id:            { default: '' },
      label:         { default: '' },
      refType:       { default: 'check' }, // check | damage | attr
      value:         { default: '' },
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="rule_ref"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'rule_ref' })];
  },

  addNodeView() {
    return VueNodeViewRenderer(RuleRefView as any);
  },
});
