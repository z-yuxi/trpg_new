import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
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
      id:                       { default: '' },
      collapsed:                { default: false },
      npc_name:                 { default: '' },
      appearance:               { default: '' },
      personality:              { default: '' },
      background:               { default: '' },
      attributes:               { default: {} },
      skills:                   { default: {} },
      resources:                { default: {} },
      combat_data:              { default: null },
      location_scene_block_id:  { default: null },
      relationships:            { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="npc_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'npc_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(NpcBlockView as any);
  },
});

