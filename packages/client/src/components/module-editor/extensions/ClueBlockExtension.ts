import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
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
      id:                         { default: '' },
      collapsed:                  { default: false },
      clue_name:                  { default: '' },
      clue_type:                  { default: 'physical' },
      content:                    { default: '' },
      unlock_condition:           { default: '' },
      reveal_method:              { default: 'auto' },
      associated_scene_block_id:  { default: null },
      associated_check_block_id:  { default: null },
      theme:                      { default: 'river' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="clue_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'clue_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(ClueBlockView as any);
  },
});

