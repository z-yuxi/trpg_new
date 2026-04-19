import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { BASE_BLOCK_ATTRS } from './BaseBlockExtension';
import ClueBlockView from '../blocks/ClueBlockView.vue';

export const ClueBlockExtension = Node.create({
  name: 'clue_block',
  group: 'block',
  content: 'block*',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      ...BASE_BLOCK_ATTRS,
      clue_name: { default: '' },
      clue_type: { default: 'physical' },
      visibility: { default: 'hidden' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="clue_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'clue_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(ClueBlockView);
  },
});
