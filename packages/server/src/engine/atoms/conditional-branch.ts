import type { AtomNode, AtomOutput } from '../atom-interface';

interface Branch {
  condition: string | number | boolean;
  label?: string;
}

/**
 * ConditionalBranchAtom
 * 多分支条件（switch-case 风格）
 * 将 value 与各 branch.condition 比较，输出匹配的分支索引和标签
 */
export class ConditionalBranchAtom implements AtomNode {
  type = 'conditional_branch';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const value = inputs['value'];
    const branches = (inputs['branches'] ?? []) as Branch[];

    if (!Array.isArray(branches)) {
      throw new Error("conditional_branch: 'branches' must be an array");
    }

    // 查找匹配分支
    let matchedIndex = -1;
    let matchedLabel = 'default';

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      // 支持字符串范围表达式如 ">5", "<=10", "==critical"
      const cond = branch.condition;
      let matches = false;

      if (typeof cond === 'string' && typeof value === 'number') {
        const rangeMatch = cond.match(/^([<>=!]{1,2})\s*(-?\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
          const op = rangeMatch[1];
          const threshold = parseFloat(rangeMatch[2]);
          switch (op) {
            case '>':  matches = value > threshold; break;
            case '>=': matches = value >= threshold; break;
            case '<':  matches = value < threshold; break;
            case '<=': matches = value <= threshold; break;
            case '==': matches = value === threshold; break;
            case '!=': matches = value !== threshold; break;
          }
        } else {
          matches = String(value) === cond;
        }
      } else {
        matches = value === cond;
      }

      if (matches) {
        matchedIndex = i;
        matchedLabel = branch.label ?? `branch_${i}`;
        break;
      }
    }

    // 构建动态输出（branch_0, branch_1, ..., default）
    const dynamicOutputs: Record<string, unknown> = { default: matchedIndex === -1 };
    branches.forEach((b, i) => {
      dynamicOutputs[b.label ?? `branch_${i}`] = i === matchedIndex;
    });

    return {
      result: {
        matched_branch: matchedIndex,
        matched_label: matchedLabel,
        is_default: matchedIndex === -1,
        ...dynamicOutputs,
      },
      logs: {
        input_summary: `value=${JSON.stringify(value)}, branches=${branches.length}`,
        output_summary: matchedIndex >= 0
          ? `matched branch ${matchedIndex} (${matchedLabel})`
          : 'no match → default',
      },
    };
  }
}
