import type { AtomNode, AtomOutput } from '../atom-interface';
import { evaluateFormula, type FormulaContext } from '../formula-evaluator';

export class FormulaEvalAtom implements AtomNode {
  type = 'formula_eval';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const formula = inputs['formula'] as string;
    const baseVariables = (inputs['variables'] ?? {}) as FormulaContext;

    if (!formula || typeof formula !== 'string') {
      throw new Error("formula_eval: 'formula' must be a non-empty string");
    }
    if (typeof baseVariables !== 'object' || baseVariables === null) {
      throw new Error("formula_eval: 'variables' must be an object");
    }

    // 将 inputs 中除 formula 和 variables 之外的数字类型输入合并为额外变量
    const extraVars: FormulaContext = {};
    for (const [key, val] of Object.entries(inputs)) {
      if (key !== 'formula' && key !== 'variables' && typeof val === 'number' && isFinite(val)) {
        extraVars[key] = val;
      }
    }
    const variables: FormulaContext = { ...baseVariables, ...extraVars };

    const value = evaluateFormula(formula, variables);

    return {
      result: { value, formula },
      logs: {
        input_summary: `formula="${formula}", vars=${JSON.stringify(variables)}`,
        output_summary: `value=${value}`,
      },
    };
  }
}
