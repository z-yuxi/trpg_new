import type { AtomNode, AtomOutput } from '../atom-interface';

export class ResourceModifyAtom implements AtomNode {
  type = 'resource_modify';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const current_value = inputs['current_value'] as number;
    const max_value = inputs['max_value'] as number;
    const delta = inputs['delta'] as number;
    const min_value = (inputs['min_value'] as number | undefined) ?? 0;

    if (typeof current_value !== 'number') throw new Error("resource_modify: 'current_value' must be a number");
    if (typeof max_value !== 'number') throw new Error("resource_modify: 'max_value' must be a number");
    if (typeof delta !== 'number') throw new Error("resource_modify: 'delta' must be a number");

    const old_value = current_value;
    let new_value = current_value + delta;
    const unclamped = new_value;

    // Clamp to [min_value, max_value]
    new_value = Math.max(min_value, Math.min(max_value, new_value));
    const clamped = new_value !== unclamped;

    return {
      result: { old_value, new_value, delta, clamped },
      logs: {
        input_summary: `current=${current_value}, delta=${delta}, max=${max_value}, min=${min_value}`,
        output_summary: `old=${old_value} → new=${new_value}${clamped ? ' (clamped)' : ''}`,
      },
    };
  }
}
