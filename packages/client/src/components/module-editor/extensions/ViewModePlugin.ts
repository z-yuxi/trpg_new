import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction, EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Node } from '@tiptap/pm/model';

export type ViewMode = 'edit' | 'kp' | 'player';

export const viewModeKey = new PluginKey<ViewMode>('viewMode');

export function createViewModePlugin(initialMode: ViewMode = 'edit'): Plugin {
  return new Plugin<ViewMode>({
    key: viewModeKey,

    state: {
      init: (): ViewMode => initialMode,
      apply: (tr: Transaction, mode: ViewMode): ViewMode =>
        (tr.getMeta(viewModeKey) as ViewMode | undefined) ?? mode,
    },

    props: {
      decorations(state: EditorState) {
        const mode = viewModeKey.getState(state);
        if (mode !== 'player') return DecorationSet.empty;

        const decorations: Decoration[] = [];

        state.doc.descendants((node: Node, pos: number) => {
          if (node.type.name === 'kp_info') {
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'kp-info--player-collapsed',
              }),
            );
            return false; // 不递归进 kp_info 内部
          }
        });

        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

export function setViewMode(view: EditorView, mode: ViewMode): void {
  view.dispatch(view.state.tr.setMeta(viewModeKey, mode));
}
