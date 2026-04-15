import type { AtomNode, AtomOutput } from '../atom-interface';

export class IfElseAtom implements AtomNode {
  type = 'if_else';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const condition = inputs['condition'];
    const then_value = inputs['then_value'];
    const else_value = inputs['else_value'];

    if (typeof condition !== 'boolean') {
      throw new Error("if_else: 'condition' must be a boolean");
    }

    const branch: 'then' | 'else' = condition ? 'then' : 'else';
    const value = condition ? then_value : else_value;

    return {
      result: { value, branch },
      logs: {
        input_summary: `condition=${condition}`,
        output_summary: `branch=${branch}, value=${JSON.stringify(value)}`,
      },
    };
  }
}
