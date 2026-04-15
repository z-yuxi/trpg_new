import type { AtomNode, AtomOutput } from '../atom-interface';

type CompareOperator = '<' | '<=' | '>' | '>=' | '==' | '!=';

export class ThresholdCompareAtom implements AtomNode {
  type = 'threshold_compare';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const value = inputs['value'] as number;
    const threshold = inputs['threshold'] as number;
    const operator = inputs['operator'] as CompareOperator;

    if (typeof value !== 'number') throw new Error("threshold_compare: 'value' must be a number");
    if (typeof threshold !== 'number') throw new Error("threshold_compare: 'threshold' must be a number");

    const validOps: CompareOperator[] = ['<', '<=', '>', '>=', '==', '!='];
    if (!validOps.includes(operator)) {
      throw new Error(`threshold_compare: invalid operator '${operator}'`);
    }

    let passed: boolean;
    switch (operator) {
      case '<':  passed = value < threshold; break;
      case '<=': passed = value <= threshold; break;
      case '>':  passed = value > threshold; break;
      case '>=': passed = value >= threshold; break;
      case '==': passed = value === threshold; break;
      case '!=': passed = value !== threshold; break;
    }

    return {
      result: { passed, value, threshold, operator },
      logs: {
        input_summary: `value=${value} ${operator} threshold=${threshold}`,
        output_summary: `passed=${passed}`,
      },
    };
  }
}
