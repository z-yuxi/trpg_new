import type { AtomNode, AtomOutput } from '../atom-interface';
import { evaluateDice } from '../dice-evaluator';

interface TableEntry {
  weight: number;
  value: string | number;
}

/**
 * RandomTableAtom
 * 随机表（如疯狂症状表、随机遭遇表）
 */
export class RandomTableAtom implements AtomNode {
  type = 'random_table';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const tableEntries = (inputs['table_entries'] ?? []) as TableEntry[];
    const rollExpression = (inputs['roll_expression'] ?? '') as string;

    if (!Array.isArray(tableEntries) || tableEntries.length === 0) {
      throw new Error("random_table: 'table_entries' must be a non-empty array");
    }

    let rollResult: number;

    if (rollExpression) {
      const diceResult = evaluateDice(rollExpression);
      rollResult = diceResult.total;
    } else {
      // 使用权重随机
      const totalWeight = tableEntries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
      rollResult = Math.floor(Math.random() * totalWeight) + 1;
    }

    // 按权重累积选择
    const totalWeight = tableEntries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
    const normalizedRoll = ((rollResult - 1) / Math.max(totalWeight - 1, 1)) * totalWeight;

    let cumulative = 0;
    let selectedEntry: TableEntry | null = null;
    for (const entry of tableEntries) {
      cumulative += entry.weight ?? 1;
      if (rollResult <= cumulative) { selectedEntry = entry; break; }
    }
    if (!selectedEntry) selectedEntry = tableEntries[tableEntries.length - 1];

    return {
      result: {
        selected_entry: selectedEntry,
        roll_result: rollResult,
      },
      logs: {
        input_summary: `entries=${tableEntries.length}, roll=${rollExpression || 'weighted'}`,
        output_summary: `roll=${rollResult}, selected=${JSON.stringify(selectedEntry?.value)}`,
      },
    };
  }
}
