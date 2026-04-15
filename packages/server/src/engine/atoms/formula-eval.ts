import type { AtomNode, AtomOutput } from '../atom-interface';
import { evaluateFormula, type FormulaContext } from '../formula-evaluator';

export class FormulaEvalAtom implements AtomNode {
  type = 'formula_eval';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const formula = inputs['formula'] as string;
    const variables = inputs['variables'] as FormulaContext;

    if (!formula || typeof formula !== 'string') {
      throw new Error("formula_eval: 'formula' must be a non-empty string");
    }
    if (!variables || typeof variables !== 'object') {
      throw new Error("formula_eval: 'variables' must be an object");
    }

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
