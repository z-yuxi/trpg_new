import type { AtomNode, AtomOutput } from '../atom-interface';
import { evaluateDiceWithRng, evaluateDice, type SingleRoll } from '../dice-evaluator';

export class DiceRollAtom implements AtomNode {
  type = 'dice_roll';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const expression = inputs['expression'] as string;
    const rng = inputs['rng'] as (() => number) | undefined;

    if (!expression || typeof expression !== 'string') {
      throw new Error("dice_roll: 'expression' input must be a non-empty string");
    }

    const result = rng
      ? evaluateDiceWithRng(expression, rng)
      : evaluateDice(expression);

    return {
      result: {
        total: result.total,
        details: result.details,
        rolls: result.rolls as SingleRoll[],
      },
      logs: {
        input_summary: `expression="${expression}"`,
        output_summary: `total=${result.total}, details="${result.details}"`,
      },
    };
  }
}
