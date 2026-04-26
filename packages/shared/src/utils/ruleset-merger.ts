/**
 * ruleset-merger.ts
 * 涓夋柟鍚堝苟绠楁硶锛堢函鍑芥暟锛屽墠鍚庣鍏辩敤锛?
 * 鍩轰簬 node_id 鍋氶泦鍚堣繍绠楋細parent 涓?base锛宱urs/theirs 涓轰袱璺慨鏀?
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
 * 涓夋柟鍚堝苟
 * @param base  鈥?鍒嗗弶鏃跺埢鐨?parent 蹇収
 * @param ours  鈥?鏈湴鍒嗘敮褰撳墠鐘舵€?
 * @param theirs 鈥?parent 鏈€鏂扮姸鎬?
 */
export function mergeRulesetGraphs(base: SimpleGraph, ours: SimpleGraph, theirs: SimpleGraph): MergeResult {
  const baseMap = new Map(base.atoms.map((n) => [n.node_id, n]));
  const ourMap = new Map(ours.atoms.map((n) => [n.node_id, n]));
  const theirMap = new Map(theirs.atoms.map((n) => [n.node_id, n]));

  const merged: AtomNode[] = [];
  const conflicts: MergeConflict[] = [];
  const processed = new Set<string>();

  // 閬嶅巻 theirs锛堜笂娓革級
  for (const [id, theirNode] of theirMap) {
    processed.add(id);
    const baseNode = baseMap.get(id);
    const ourNode = ourMap.get(id);

    const theirChanged = JSON.stringify(theirNode) !== JSON.stringify(baseNode);
    const ourChanged = ourNode !== undefined && JSON.stringify(ourNode) !== JSON.stringify(baseNode);

    if (!ourNode) {
      if (baseNode) {
        // 鎴戜滑鍒犻櫎浜嗭紝theirs 浠嶅瓨鍦?
        if (theirChanged) {
          // theirs 涔熶慨鏀逛簡锛屽啿绐?
          conflicts.push({ node_id: id, type: 'modified_both', our_node: null as unknown as AtomNode, their_node: theirNode });
        }
        // else: 鎴戜滑鍒犻櫎锛宼heirs 鏈敼 鈫?淇濈暀鍒犻櫎锛堜笉鍔犲叆 merged锛?
      } else {
        // theirs 鏂板
        merged.push(theirNode);
      }
    } else if (!theirChanged) {
      // theirs 鏈彉锛屼繚鐣欐垜浠殑
      merged.push(ourNode);
    } else if (!ourChanged) {
      // 鎴戜滑鏈彉锛屾帴鍙?theirs
      merged.push(theirNode);
    } else if (JSON.stringify(ourNode) === JSON.stringify(theirNode)) {
      // 鍙屾柟鏀逛簡浣嗙粨鏋滅浉鍚?
      merged.push(ourNode);
    } else {
      // 鍙屾柟閮芥敼浜嗕笖涓嶅悓 鈫?鍐茬獊锛屼繚鐣?ours
      conflicts.push({ node_id: id, type: 'modified_both', our_node: ourNode, their_node: theirNode });
      merged.push(ourNode);
    }
  }

  // 閬嶅巻 ours 涓?theirs 娌℃湁鐨勮妭鐐?
  for (const [id, ourNode] of ourMap) {
    if (processed.has(id)) continue;
    const baseNode = baseMap.get(id);
    if (!baseNode) {
      // 鎴戜滑鏂板鐨?
      merged.push(ourNode);
    }
    // else: 瀛樺湪浜?base 浣?theirs 鍒犻櫎浜?鈫?theirs 鍒犱簡瀹?
    // 鑻ユ垜浠篃鏈敼锛屾帴鍙楀垹闄わ紱鑻ユ垜浠敼浜嗭紝鍐茬獊
    else {
      const ourChanged = JSON.stringify(ourNode) !== JSON.stringify(baseNode);
      if (ourChanged) {
        conflicts.push({ node_id: id, type: 'modified_both', our_node: ourNode, their_node: null as unknown as AtomNode });
        merged.push(ourNode);
      }
      // else: 鎴戜滑鏈敼锛屾帴鍙楀垹闄?
    }
  }

  return {
    status: conflicts.length > 0 ? 'conflicts' : 'clean',
    merged_graph: { atoms: merged, connections: theirs.connections as object[] },
    conflicts,
  };
}

