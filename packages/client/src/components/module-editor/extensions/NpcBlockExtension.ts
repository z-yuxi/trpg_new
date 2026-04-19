import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { BASE_BLOCK_ATTRS } from './BaseBlockExtension';
import NpcBlockView from '../blocks/NpcBlockView.vue';

export const NpcBlockExtension = Node.create({
  name: 'npc_block',
  group: 'block',
  content: 'block*',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      ...BASE_BLOCK_ATTRS,
      npc_name: { default: '' },
      appearance: { default: '' },
      personality: { default: '' },
      background: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="npc_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'npc_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(NpcBlockView);
  },
});
