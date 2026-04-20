import type { AtomNode } from './atom-interface';
import { DiceRollAtom } from './atoms/dice-roll';
import { ThresholdCompareAtom } from './atoms/threshold-compare';
import { MultiplyAtom } from './atoms/multiply';
import { IfElseAtom } from './atoms/if-else';
import { ResultCollectorAtom } from './atoms/result-collector';
import { CharacterSkillReaderAtom } from './atoms/character-skill-reader';
import { ResourceModifyAtom } from './atoms/resource-modify';
import { FormulaEvalAtom } from './atoms/formula-eval';
// P1 原子
import { ResourceModifyBatchAtom } from './atoms/resource-modify-batch';
import { TableLookupAtom } from './atoms/table-lookup';
import { RandomTableAtom } from './atoms/random-table';
import { EffectApplyAtom } from './atoms/effect-apply';
import { EffectRemoveAtom } from './atoms/effect-remove';
import { LoopAtom } from './atoms/loop';
import { AggregateAtom } from './atoms/aggregate';
import { ConditionalBranchAtom } from './atoms/conditional-branch';

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
// P1 原子
globalRegistry.register('resource_modify_batch', ResourceModifyBatchAtom);
globalRegistry.register('table_lookup', TableLookupAtom);
globalRegistry.register('random_table', RandomTableAtom);
globalRegistry.register('effect_apply', EffectApplyAtom);
globalRegistry.register('effect_remove', EffectRemoveAtom);
globalRegistry.register('loop', LoopAtom);
globalRegistry.register('aggregate', AggregateAtom);
globalRegistry.register('conditional_branch', ConditionalBranchAtom);
