import type { AtomNode, AtomOutput } from '../atom-interface';

/**
 * LoopAtom
 * 循环执行 N 次，累积输入值
 * 注意：不支持真正的子图递归执行，而是对 initial_value 应用 N 次 step_value 累加
 * 完整的子图执行需要在 GraphExecutor 层处理，此原子提供循环计数辅助
 */
export class LoopAtom implements AtomNode {
  type = 'loop';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const iterations = (inputs['iterations'] ?? 1) as number;
    const initialValue = (inputs['initial_value'] ?? 0) as number;
    const stepValue = (inputs['step_value'] ?? 1) as number;
    const operation = (inputs['operation'] ?? 'add') as 'add' | 'mul';

    if (typeof iterations !== 'number' || iterations < 0 || iterations > 1000) {
      throw new Error("loop: 'iterations' must be a number between 0 and 1000");
    }

    const iterationResults: number[] = [];
    let current = initialValue;

    for (let i = 0; i < iterations; i++) {
      if (operation === 'add') current += stepValue;
      else if (operation === 'mul') current *= stepValue;
      iterationResults.push(current);
    }

    return {
      result: {
        iteration_results: iterationResults,
        final_value: current,
        iterations_completed: iterations,
      },
      logs: {
        input_summary: `iterations=${iterations}, initial=${initialValue}, step=${stepValue}, op=${operation}`,
        output_summary: `final=${current}, iterations_completed=${iterations}`,
      },
    };
  }
}
