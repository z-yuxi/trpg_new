import type { AtomNode } from './atom-interface';
import { DiceRollAtom } from './atoms/dice-roll';
import { ThresholdCompareAtom } from './atoms/threshold-compare';
import { MultiplyAtom } from './atoms/multiply';
import { IfElseAtom } from './atoms/if-else';
import { ResultCollectorAtom } from './atoms/result-collector';
import { CharacterSkillReaderAtom } from './atoms/character-skill-reader';
import { ResourceModifyAtom } from './atoms/resource-modify';
import { FormulaEvalAtom } from './atoms/formula-eval';

export class AtomRegistry {
  private atoms = new Map<string, new () => AtomNode>();

  register(type: string, ctor: new () => AtomNode): void {
    this.atoms.set(type, ctor);
  }

  get(type: string): AtomNode {
    const Ctor = this.atoms.get(type);
    if (!Ctor) {
      throw new Error(`AtomRegistry: unknown atom type '${type}'. Registered: [${[...this.atoms.keys()].join(', ')}]`);
    }
    return new Ctor();
  }

  has(type: string): boolean {
    return this.atoms.has(type);
  }

  types(): string[] {
    return [...this.atoms.keys()];
  }
}

/** 全局注册表实例，预注册所有 P0 原子 */
export const globalRegistry = new AtomRegistry();
globalRegistry.register('dice_roll', DiceRollAtom);
globalRegistry.register('threshold_compare', ThresholdCompareAtom);
globalRegistry.register('multiply', MultiplyAtom);
globalRegistry.register('if_else', IfElseAtom);
globalRegistry.register('result_collector', ResultCollectorAtom);
globalRegistry.register('character_skill_reader', CharacterSkillReaderAtom);
globalRegistry.register('resource_modify', ResourceModifyAtom);
globalRegistry.register('formula_eval', FormulaEvalAtom);
