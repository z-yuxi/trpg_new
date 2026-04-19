import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { BASE_BLOCK_ATTRS } from './BaseBlockExtension';
import CheckBlockView from '../blocks/CheckBlockView.vue';

export const CheckBlockExtension = Node.create({
  name: 'check_block',
  group: 'block',
  content: 'block*',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      ...BASE_BLOCK_ATTRS,
      check_name: { default: '' },
      skill: { default: '' },
      difficulty: { default: 'normal' },
      gm_only: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="check_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'check_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(CheckBlockView);
  },
});
