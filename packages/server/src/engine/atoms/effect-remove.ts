import type { AtomNode, AtomOutput } from '../atom-interface';

/**
 * EffectRemoveAtom
 * 移除目标角色的临时效果
 */
export class EffectRemoveAtom implements AtomNode {
  type = 'effect_remove';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const targetCharacterId = inputs['target_character_id'] as string;
    const effectId = inputs['effect_id'] as string | undefined;
    const effectName = inputs['effect_name'] as string | undefined;

    if (!effectId && !effectName) {
      throw new Error("effect_remove: either 'effect_id' or 'effect_name' is required");
    }

    // 在实际执行时，此处会更新 character_scene_states.temporary_effects
    // 返回移除结果，由外部系统处理
    return {
      result: {
        removed_success: true,
        target_character_id: targetCharacterId,
        effect_id: effectId ?? null,
        effect_name: effectName ?? null,
      },
      logs: {
        input_summary: `target=${targetCharacterId}, effect_id=${effectId ?? effectName}`,
        output_summary: 'removed_success=true',
      },
    };
  }
}
