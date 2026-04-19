import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { BASE_BLOCK_ATTRS } from './BaseBlockExtension';
import DialogBlockView from '../blocks/DialogBlockView.vue';

export const DialogBlockExtension = Node.create({
  name: 'dialog_block',
  group: 'block',
  content: 'block*',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      ...BASE_BLOCK_ATTRS,
      speaker: { default: '' },
      tone: { default: 'neutral' },
      gm_only: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="dialog_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'dialog_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(DialogBlockView);
  },
});
