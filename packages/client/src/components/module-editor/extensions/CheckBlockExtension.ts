import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
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
      id:                   { default: '' },
      collapsed:            { default: false },
      check_name:           { default: '' },
      description:          { default: '' },
      check_type:           { default: '' },
      skill_or_attribute:   { default: '' },
      difficulty_override:  { default: null },
      success_effect:       { default: '' },
      failure_effect:       { default: '' },
      critical_effect:      { default: '' },
      fumble_effect:        { default: '' },
      ruleset_command:      { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="check_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'check_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(CheckBlockView as any);
  },
});
