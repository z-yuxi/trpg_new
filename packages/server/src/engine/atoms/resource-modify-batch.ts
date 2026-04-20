import type { AtomNode, AtomOutput } from '../atom-interface';

interface Modification {
  resource_name: string;
  operation: 'add' | 'sub' | 'set';
  value: number;
}

interface ResourceModifyBatchResult {
  resource_name: string;
  old_value: number;
  new_value: number;
  clamped: boolean;
}

/**
 * ResourceModifyBatchAtom
 * 批量修改多个资源（如 HP-=damage, SAN-=loss）
 */
export class ResourceModifyBatchAtom implements AtomNode {
  type = 'resource_modify_batch';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const modifications = (inputs['modifications'] ?? []) as Modification[];
    const currentValues = (inputs['current_values'] ?? {}) as Record<string, number>;
    const minValues = (inputs['min_values'] ?? {}) as Record<string, number>;
    const maxValues = (inputs['max_values'] ?? {}) as Record<string, number>;

    if (!Array.isArray(modifications)) {
      throw new Error("resource_modify_batch: 'modifications' must be an array");
    }

    const results: ResourceModifyBatchResult[] = [];

    for (const mod of modifications) {
      const { resource_name, operation, value } = mod;
      const oldVal = (currentValues[resource_name] ?? 0) as number;
      let newVal: number;

      switch (operation) {
        case 'add': newVal = oldVal + value; break;
        case 'sub': newVal = oldVal - value; break;
        case 'set': newVal = value; break;
        default: throw new Error(`resource_modify_batch: unknown operation '${operation}'`);
      }

      const min = minValues[resource_name] ?? -Infinity;
      const max = maxValues[resource_name] ?? Infinity;
      const clamped = newVal < min || newVal > max;
      newVal = Math.max(min, Math.min(max, newVal));

      results.push({ resource_name, old_value: oldVal, new_value: newVal, clamped });
    }

    return {
      result: { results },
      logs: {
        input_summary: `modifications=${JSON.stringify(modifications.map(m => `${m.resource_name}${m.operation === 'add' ? '+' : m.operation === 'sub' ? '-' : '='}${m.value}`))}`,
        output_summary: `modified=${results.length} resources`,
      },
    };
  }
}
