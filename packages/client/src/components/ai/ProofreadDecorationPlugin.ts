import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { CheckTextIssue } from '../../api/ai';

export interface ProofreadDecoration {
  issues: CheckTextIssue[];
  acceptedIndexes: Set<number>;
}

export const proofreadDecorationKey = new PluginKey('proofreadDecoration');

/**
 * ProseMirror 装饰插件：为 AI 校对的问题文本添加高亮背景
 * - 在编辑器中用颜色标记每个问题位置
 * - 支持点击事件集成（定位到问题）
 * - 自动过滤已接受的问题
 */
export function createProofreadDecorationPlugin() {
  return new Plugin({
    key: proofreadDecorationKey,
    state: {
      init() {
        return {
          issues: [] as CheckTextIssue[],
          acceptedIndexes: new Set<number>(),
        };
      },
      apply(tr, state) {
        const meta = tr.getMeta('updateProofread');
        if (meta) {
          return {
            issues: meta.issues || state.issues,
            acceptedIndexes: meta.acceptedIndexes || state.acceptedIndexes,
          };
        }
        return state;
      },
    },
    props: {
      decorations(state) {
        const { issues, acceptedIndexes } = proofreadDecorationKey.getState(state);
        if (!issues || issues.length === 0) {
          return DecorationSet.empty;
        }

        const decorations: Decoration[] = [];
        const doc = state.doc;

        // 遍历所有问题，找到对应的文本位置并添加装饰
        issues.forEach((issue: CheckTextIssue, index: number) => {
          // 跳过已接受的问题
          if (acceptedIndexes.has(index)) {
            return;
          }

          // 在文档中搜索 issue.original 文本
          const searchText = issue.original;
          let found = false;

          doc.descendants((node, pos) => {
            if (found || !node.isText) return;

            const nodeText = node.text || '';
            const matchPos = nodeText.indexOf(searchText);

            if (matchPos !== -1) {
              const start = pos + matchPos;
              const end = start + searchText.length;

              // 根据问题类型选择装饰样式
              const className = `proofread-issue proofread-issue--${issue.type}`;

              decorations.push(
                Decoration.inline(start, end, {
                  class: className,
                  'data-issue-index': String(index),
                  'data-issue-type': issue.type,
                })
              );

              found = true;
            }
          });
        });

        return DecorationSet.create(doc, decorations);
      },
    },
  });
}

/**
 * 工具函数：更新装饰插件的状态
 */
export function updateProofreadDecorations(
  state: any,
  issues: CheckTextIssue[],
  acceptedIndexes: Set<number>
) {
  return state.tr.setMeta('updateProofread', {
    issues,
    acceptedIndexes,
  });
}
