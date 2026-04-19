import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import EventBlockView from '../blocks/EventBlockView.vue';

export const EventBlockExtension = Node.create({
  name: 'event_block',
  group: 'block',
  content: 'block*',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:                         { default: '' },
      collapsed:                  { default: false },
      event_name:                 { default: '' },
      trigger:                    { default: '' },
      difficulty:                 { default: 'normal' },
      description:                { default: '' },
      associated_check_block_id:  { default: null },
      forced_movement:            { default: null },
      time_effect:                { default: null },
      branches:                   { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="event_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'event_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(EventBlockView);
  },
});
