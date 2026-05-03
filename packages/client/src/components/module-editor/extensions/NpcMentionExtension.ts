import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import NpcMentionView from '../blocks/NpcMentionView.vue';

export const NpcMentionExtension = Node.create({
  name: 'npc_mention',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id:            { default: '' },
      label:         { default: '' },
      type:          { default: 'npc' },
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="npc_mention"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'npc_mention' })];
  },

  addNodeView() {
    return VueNodeViewRenderer(NpcMentionView as any);
  },
});
