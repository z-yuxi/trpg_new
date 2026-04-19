import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { BASE_BLOCK_ATTRS } from './BaseBlockExtension';
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
      ...BASE_BLOCK_ATTRS,
      event_name: { default: '' },
      trigger: { default: '' },
      outcome: { default: '' },
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
