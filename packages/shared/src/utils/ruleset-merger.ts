/**
 * ruleset-merger.ts
 * 三方合并算法（纯函数，前后端共用）
 * 基于 node_id 做集合运算：parent 为 base，ours/theirs 为两路修改
 */
import type { MergeResult, MergeConflict } from '../types';

interface AtomNode {
  node_id: string;
  [key: string]: unknown;
}

interface SimpleGraph {
  atoms: AtomNode[];
  connections: unknown[];
}

/**
 * 三方合并
 * @param base  — 分叉时刻的 parent 快照
 * @param ours  — 本地分支当前状态
 * @param theirs — parent 最新状态
 */
export function mergeRulesetGraphs(base: SimpleGraph, ours: SimpleGraph, theirs: SimpleGraph): MergeResult {
  const baseMap = new Map(base.atoms.map((n) => [n.node_id, n]));
  const ourMap = new Map(ours.atoms.map((n) => [n.node_id, n]));
  const theirMap = new Map(theirs.atoms.map((n) => [n.node_id, n]));

  const merged: AtomNode[] = [];
  const conflicts: MergeConflict[] = [];
  const processed = new Set<string>();

  // 遍历 theirs（上游）
  for (const [id, theirNode] of theirMap) {
    processed.add(id);
    const baseNode = baseMap.get(id);
    const ourNode = ourMap.get(id);

    const theirChanged = JSON.stringify(theirNode) !== JSON.stringify(baseNode);
    const ourChanged = ourNode !== undefined && JSON.stringify(ourNode) !== JSON.stringify(baseNode);

    if (!ourNode) {
      if (baseNode) {
        // 我们删除了，theirs 仍存在
        if (theirChanged) {
          // theirs 也修改了，冲突
          conflicts.push({ node_id: id, type: 'modified_both', our_node: null as unknown as AtomNode, their_node: theirNode });
        }
        // else: 我们删除，theirs 未改 → 保留删除（不加入 merged）
      } else {
        // theirs 新增
        merged.push(theirNode);
      }
    } else if (!theirChanged) {
      // theirs 未变，保留我们的
      merged.push(ourNode);
    } else if (!ourChanged) {
      // 我们未变，接受 theirs
      merged.push(theirNode);
    } else if (JSON.stringify(ourNode) === JSON.stringify(theirNode)) {
      // 双方改了但结果相同
      merged.push(ourNode);
    } else {
      // 双方都改了且不同 → 冲突，保留 ours
      conflicts.push({ node_id: id, type: 'modified_both', our_node: ourNode, their_node: theirNode });
      merged.push(ourNode);
    }
  }

  // 遍历 ours 中 theirs 没有的节点
  for (const [id, ourNode] of ourMap) {
    if (processed.has(id)) continue;
    const baseNode = baseMap.get(id);
    if (!baseNode) {
      // 我们新增的
      merged.push(ourNode);
    }
    // else: 存在于 base 但 theirs 删除了 → theirs 删了它
    // 若我们也未改，接受删除；若我们改了，冲突
    else {
      const ourChanged = JSON.stringify(ourNode) !== JSON.stringify(baseNode);
      if (ourChanged) {
        conflicts.push({ node_id: id, type: 'modified_both', our_node: ourNode, their_node: null as unknown as AtomNode });
        merged.push(ourNode);
      }
      // else: 我们未改，接受删除
    }
  }

  return {
    merged_graph: { atoms: merged, connections: theirs.connections as object[] },
    conflicts,
  };
}
