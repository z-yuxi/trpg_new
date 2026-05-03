import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import ConsequenceHintView from '../blocks/ConsequenceHintView.vue';

export const ConsequenceHintExtension = Node.create({
  name: 'consequence_hint',
  group: 'block',
  content: 'block+',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:            { default: '' },
      condition:     { default: '' },
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="consequence_hint"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'consequence_hint' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(ConsequenceHintView as any);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;
        if ($from.depth >= 2) {
          const grandparent = $from.node($from.depth - 1);
          if (grandparent.type.name === 'consequence_hint') {
            const parentIndex = $from.index($from.depth - 1);
            if (parentIndex === 0 && $from.parentOffset === 0) {
              return editor.commands.deleteNode('consequence_hint');
            }
          }
        }
        return false;
      },
    };
  },
});
