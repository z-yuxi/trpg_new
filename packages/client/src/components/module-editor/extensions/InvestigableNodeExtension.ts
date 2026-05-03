import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import InvestigableNodeView from '../blocks/InvestigableNodeView.vue';

export const InvestigableNodeExtension = Node.create({
  name: 'investigable_node',
  group: 'block',
  content: 'block+',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:            { default: '' },
      label:         { default: '' },
      visibility:    { default: 'all' },
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="investigable_node"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'investigable_node' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(InvestigableNodeView as any);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;
        if ($from.parentOffset === 0 && $from.parent.type.name !== 'investigable_node') {
          // 检查父节点的父节点是否是 investigable_node
          if ($from.depth >= 2) {
            const grandparent = $from.node($from.depth - 1);
            if (grandparent.type.name === 'investigable_node') {
              const parentIndex = $from.index($from.depth - 1);
              // 仅当是第一个子块且第一个字符时删除整个节点
              if (parentIndex === 0 && $from.parentOffset === 0) {
                return editor.commands.deleteNode('investigable_node');
              }
            }
          }
        }
        return false;
      },
    };
  },
});
