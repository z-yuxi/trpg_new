import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import PlayerHandoutView from '../blocks/PlayerHandoutView.vue';

export const PlayerHandoutExtension = Node.create({
  name: 'player_handout',
  group: 'block',
  content: 'block+',
  atom: false,
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      id:            { default: '' },
      label:         { default: '' },
      distributed:   { default: false },
      _version:      { default: 0 },
      _lastModified: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="player_handout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'player_handout' }), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(PlayerHandoutView as any);
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from } = selection;
        if ($from.depth >= 2) {
          const grandparent = $from.node($from.depth - 1);
          if (grandparent.type.name === 'player_handout') {
            const parentIndex = $from.index($from.depth - 1);
            if (parentIndex === 0 && $from.parentOffset === 0) {
              return editor.commands.deleteNode('player_handout');
            }
          }
        }
        return false;
      },
    };
  },
});
