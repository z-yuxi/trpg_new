import type { AtomNode, AtomOutput } from '../atom-interface';

type LookupMode = 'exact' | 'range' | 'closest';

/**
 * TableLookupAtom
 * 查表（如伤害奖励表、追击表）
 * table_data: 二维数组，第一列为 key，其余列为数据
 */
export class TableLookupAtom implements AtomNode {
  type = 'table_lookup';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const tableData = (inputs['table_data'] ?? []) as Array<Array<number | string>>;
    const lookupKey = inputs['lookup_key'] as number | string;
    const mode = (inputs['mode'] ?? 'exact') as LookupMode;

    if (!Array.isArray(tableData) || tableData.length === 0) {
      throw new Error("table_lookup: 'table_data' must be a non-empty 2D array");
    }
    if (lookupKey === undefined || lookupKey === null) {
      throw new Error("table_lookup: 'lookup_key' is required");
    }

    let resultRow: Array<number | string> | null = null;

    if (mode === 'exact') {
      resultRow = tableData.find((row) => row[0] === lookupKey) ?? null;
    } else if (mode === 'range') {
      // 每行格式：[min, max, ...data] 或 [threshold, ...data]
      // 假设 [min_inclusive, max_inclusive, ...values]
      const key = Number(lookupKey);
      for (const row of tableData) {
        if (row.length >= 2) {
          const lo = Number(row[0]);
          const hi = Number(row[1]);
          if (key >= lo && key <= hi) { resultRow = row; break; }
        }
      }
    } else if (mode === 'closest') {
      const key = Number(lookupKey);
      let bestDist = Infinity;
      for (const row of tableData) {
        const dist = Math.abs(Number(row[0]) - key);
        if (dist < bestDist) { bestDist = dist; resultRow = row; }
      }
    }

    // threshold_value: result_row[1] if it's a number, else null
    const thresholdValue = resultRow !== null && resultRow.length >= 2 && typeof resultRow[1] === 'number'
      ? (resultRow[1] as number)
      : null;

    return {
      result: {
        result_row: resultRow,
        found: resultRow !== null,
        threshold_value: thresholdValue,
      },
      logs: {
        input_summary: `lookup_key=${lookupKey}, mode=${mode}, rows=${tableData.length}`,
        output_summary: resultRow ? `found: ${JSON.stringify(resultRow)}, threshold_value=${thresholdValue}` : 'not found',
      },
    };
  }
}
