import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
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
      id:                 { default: '' },
      collapsed:          { default: false },
      dialog_title:       { default: '' },
      participants:       { default: [] },
      lines:              { default: [] },
      trigger_condition:  { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="dialog_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'dialog_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(DialogBlockView as any);
  },
});


