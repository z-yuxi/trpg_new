import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import BranchNodeView from '../blocks/BranchNodeView.vue';

export const BranchNodeExtension = Node.create({
  name: 'branch_node',
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
    return [{ tag: 'div[data-type="branch_node"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'branch_node' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(BranchNodeView as any);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;
        if ($from.depth >= 2) {
          const grandparent = $from.node($from.depth - 1);
          if (grandparent.type.name === 'branch_node') {
            const parentIndex = $from.index($from.depth - 1);
            if (parentIndex === 0 && $from.parentOffset === 0) {
              return editor.commands.deleteNode('branch_node');
            }
          }
        }
        return false;
      },
    };
  },
});
