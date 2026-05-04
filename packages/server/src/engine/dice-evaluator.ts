import { tokenize } from './dice-lexer';
import { parse, type DiceASTNode, type DiceModifier } from './dice-parser';
import {
  DICE_MAX_COUNT,
  DICE_MAX_SIDES,
  DICE_MAX_EXPLOSION_EXTRA,
  DICE_MAX_EVAL_DEPTH,
} from './sandbox-limits';

export interface SingleRoll {
  sides: number;
  results: number[];   // 投出的每个骰子原始值
  kept: number[];      // 保留的（经 kh/kl 修饰后）
  total: number;
}

export interface DiceRollResult {
  total: number;
  details: string;     // 如 "3d6: [4, 2, 6] = 12"
  rolls: SingleRoll[];
}

function rollDie(sides: number, rng: () => number): number {
  return Math.floor(rng() * sides) + 1;
}

function applyModifiers(results: number[], sides: number, modifiers: DiceModifier[], rng: () => number): number[] {
  let kept = [...results];

  for (const mod of modifiers) {
    if (mod.type === 'keep_highest' && mod.value !== undefined) {
      const k = mod.value;
      kept = [...kept].sort((a, b) => b - a).slice(0, k);
    } else if (mod.type === 'keep_lowest' && mod.value !== undefined) {
      const k = mod.value;
      kept = [...kept].sort((a, b) => a - b).slice(0, k);
    } else if (mod.type === 'reroll' && mod.value !== undefined) {
      const rerollVal = mod.value;
      kept = kept.map(v => v === rerollVal ? rollDie(sides, rng) : v);
    } else if (mod.type === 'explode') {
      const exploded: number[] = [...kept];
      let i = 0;
      while (i < exploded.length) {
        if (exploded[i] === sides) {
          const newRoll = rollDie(sides, rng);
          exploded.push(newRoll);
        }
        i++;
        // Safety: limit explosion to DICE_MAX_EXPLOSION_EXTRA additional dice
        if (exploded.length > results.length + DICE_MAX_EXPLOSION_EXTRA) break;
      }
      kept = exploded;
    }
  }

  return kept;
}

function evaluateNode(node: DiceASTNode, rng: () => number, allRolls: SingleRoll[], depth = 0): number {
  if (depth > DICE_MAX_EVAL_DEPTH) throw new Error('Expression too deeply nested');
  switch (node.type) {
    case 'number':
      return node.value;

    case 'dice_roll': {
      const { count, sides, modifiers } = node;
      if (sides <= 0) throw new Error(`Invalid die sides: ${sides}`);
      if (count <= 0) throw new Error(`Invalid dice count: ${count}`);
      if (count > DICE_MAX_COUNT) throw new Error(`Dice count too large: ${count} (max ${DICE_MAX_COUNT})`);
      if (sides > DICE_MAX_SIDES) throw new Error(`Die sides too large: ${sides} (max ${DICE_MAX_SIDES})`);

      const results: number[] = [];
      for (let i = 0; i < count; i++) {
        results.push(rollDie(sides, rng));
      }

      const kept = applyModifiers(results, sides, modifiers, rng);
      const total = kept.reduce((a, b) => a + b, 0);

      allRolls.push({ sides, results, kept, total });
      return total;
    }

    case 'binary_op': {
      const left = evaluateNode(node.left, rng, allRolls, depth + 1);
      const right = evaluateNode(node.right, rng, allRolls, depth + 1);
      switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/':
          if (right === 0) throw new Error('Division by zero');
          return Math.floor(left / right);
      }
      throw new Error(`Unknown operator: ${node.op}`);
    }

    case 'unary_minus':
      return -evaluateNode(node.operand, rng, allRolls, depth + 1);

    case 'group':
      return evaluateNode(node.expression, rng, allRolls, depth + 1);
  }
}

function buildDetails(expression: string, total: number, rolls: SingleRoll[]): string {
  if (rolls.length === 0) return `${expression} = ${total}`;
  const rollStrs = rolls.map(r => {
    const keptStr = `[${r.kept.join(', ')}]`;
    return `${r.results.length}d${r.sides}: ${keptStr} = ${r.total}`;
  });
  return `${expression}: ${rollStrs.join(', ')} => total = ${total}`;
}

export function evaluateDiceWithRng(expression: string, rng: () => number): DiceRollResult {
  if (!expression || !expression.trim()) {
    throw new Error('Dice expression cannot be empty');
  }
  const tokens = tokenize(expression);
  const ast = parse(tokens);
  const rolls: SingleRoll[] = [];
  const total = evaluateNode(ast, rng, rolls);
  const details = buildDetails(expression, total, rolls);
  return { total, details, rolls };
}

export function evaluateDice(expression: string): DiceRollResult {
  return evaluateDiceWithRng(expression, Math.random);
}
