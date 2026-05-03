import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import KpInfoView from '../blocks/KpInfoView.vue';

export const KpInfoExtension = Node.create({
  name: 'kp_info',
  group: 'block',
  content: 'block+',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:            { default: '' },
      visibility:    { default: 'kp' },
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="kp_info"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'kp_info' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(KpInfoView as any);
  },
});
