import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import SceneBlockView from '../blocks/SceneBlockView.vue';

export const SceneBlockExtension = Node.create({
  name: 'scene_block',
  group: 'block',
  content: 'block*',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:                 { default: '' },
      collapsed:          { default: false },
      scene_name:         { default: '' },
      scene_type:         { default: 'spatial' },
      opening_time:       { default: null },
      atmosphere:         { default: '' },
      gm_notes:           { default: '' },
      map_description:    { default: '' },
      connections:        { default: [] },
      checks:             { default: [] },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="scene_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'scene_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(SceneBlockView as any);
  },
});
