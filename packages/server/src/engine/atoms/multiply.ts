import type { AtomNode, AtomOutput } from '../atom-interface';

export class MultiplyAtom implements AtomNode {
  type = 'multiply';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const a = inputs['a'] as number;
    const b = inputs['b'] as number;

    if (typeof a !== 'number') throw new Error("multiply: 'a' must be a number");
    if (typeof b !== 'number') throw new Error("multiply: 'b' must be a number");

    const value = a * b;

    return {
      result: { value },
      logs: {
        input_summary: `a=${a}, b=${b}`,
        output_summary: `value=${value}`,
      },
    };
  }
}
