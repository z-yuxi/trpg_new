/**
 * PunctuationPairExtension
 * 全角标点自动补全右半（E-1.8.1）：
 *   「→ 」  （→ ）  " → "  【 → 】
 * 规则：仅在英文输入模式下（非 IME 组合中）生效
 * Delete 行为：删除左半时若右半紧邻且未修改则同时删除
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

const PAIRS: Record<string, string> = {
  '「': '」',
  '（': '）',
  '\u201c': '\u201d', // " → "
  '【': '】',
  '『': '』',
};

export const PunctuationPairExtension = Extension.create({
  name: 'punctuationPair',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('punctuationPair'),
        props: {
          handleTextInput(view, from, to, text) {
            // 只处理单个左半标点
            if (!PAIRS[text]) return false;
            const rightHalf = PAIRS[text]!;
            const { state, dispatch } = view;
            const insertTr = state.tr.insertText(text + rightHalf, from, to);
            const afterFrom = from + text.length;
            const $pos = insertTr.doc.resolve(afterFrom);
            insertTr.setSelection(TextSelection.near($pos));
            dispatch(insertTr);
            return true;
          },

          handleKeyDown(view, event) {
            // Backspace：若左半在光标左，右半在光标右，且右半是配对的，则同时删除
            if (event.key !== 'Backspace') return false;
            const { state, dispatch } = view;
            const { from, empty } = state.selection;
            if (!empty || from < 1) return false;
            const charBefore = state.doc.textBetween(from - 1, from);
            const charAfter = state.doc.textBetween(from, Math.min(from + 1, state.doc.content.size));
            if (PAIRS[charBefore] && PAIRS[charBefore] === charAfter) {
              const tr = state.tr.delete(from - 1, from + 1);
              dispatch(tr);
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
