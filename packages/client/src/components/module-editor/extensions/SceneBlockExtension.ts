import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { BASE_BLOCK_ATTRS } from './BaseBlockExtension';
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
      ...BASE_BLOCK_ATTRS,
      scene_name: { default: '' },
      scene_type: { default: 'spatial' },
      atmosphere: { default: '' },
      gm_notes: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="scene_block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'scene_block' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(SceneBlockView);
  },
});
