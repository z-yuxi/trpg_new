import type { AtomNode, AtomOutput } from '../atom-interface';

type AggregateOperation = 'sum' | 'min' | 'max' | 'avg' | 'count' | 'concat';

/**
 * AggregateAtom
 * 聚合多个输入值（sum/min/max/avg/count/concat）
 */
export class AggregateAtom implements AtomNode {
  type = 'aggregate';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const values = (inputs['values'] ?? []) as Array<number | string>;
    const operation = (inputs['operation'] ?? 'sum') as AggregateOperation;
    const separator = (inputs['separator'] ?? ', ') as string;

    if (!Array.isArray(values)) {
      throw new Error("aggregate: 'values' must be an array");
    }

    const validOps: AggregateOperation[] = ['sum', 'min', 'max', 'avg', 'count', 'concat'];
    if (!validOps.includes(operation)) {
      throw new Error(`aggregate: unknown operation '${operation}'`);
    }

    let result: number | string;

    switch (operation) {
      case 'count':
        result = values.length;
        break;
      case 'concat':
        result = values.map(String).join(separator);
        break;
      case 'sum': {
        const nums = values.map(Number).filter(isFinite);
        result = nums.reduce((a, b) => a + b, 0);
        break;
      }
      case 'min': {
        const nums = values.map(Number).filter(isFinite);
        result = nums.length > 0 ? Math.min(...nums) : 0;
        break;
      }
      case 'max': {
        const nums = values.map(Number).filter(isFinite);
        result = nums.length > 0 ? Math.max(...nums) : 0;
        break;
      }
      case 'avg': {
        const nums = values.map(Number).filter(isFinite);
        result = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        break;
      }
    }

    return {
      result: { result, count: values.length },
      logs: {
        input_summary: `values=[${values.slice(0, 5).join(',')}${values.length > 5 ? '...' : ''}], op=${operation}`,
        output_summary: `result=${result}`,
      },
    };
  }
}
