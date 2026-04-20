import type { AtomNode, AtomOutput } from '../atom-interface';
import { generateId } from '@trpg/shared';

type DurationType = 'rounds' | 'story_time' | 'permanent';

interface Modifier {
  attribute: string;
  operation: 'add' | 'sub' | 'set' | 'mul';
  value: number;
}

/**
 * EffectApplyAtom
 * 施加临时效果到目标角色
 */
export class EffectApplyAtom implements AtomNode {
  type = 'effect_apply';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const targetCharacterId = inputs['target_character_id'] as string;
    const effectName = inputs['effect_name'] as string;
    const durationType = (inputs['duration_type'] ?? 'permanent') as DurationType;
    const durationValue = (inputs['duration_value'] ?? 0) as number;
    const modifiers = (inputs['modifiers'] ?? []) as Modifier[];

    if (!effectName) throw new Error("effect_apply: 'effect_name' is required");

    const validDurationTypes: DurationType[] = ['rounds', 'story_time', 'permanent'];
    if (!validDurationTypes.includes(durationType)) {
      throw new Error(`effect_apply: invalid duration_type '${durationType}'`);
    }

    const effectId = generateId();

    // 在实际执行时，此处会更新 character_scene_states
    // 这里返回效果 ID，由外部系统（socket handler）处理实际施加
    return {
      result: {
        effect_id: effectId,
        applied_success: true,
        effect: {
          id: effectId,
          name: effectName,
          target_character_id: targetCharacterId,
          duration_type: durationType,
          duration_value: durationValue,
          modifiers,
        },
      },
      logs: {
        input_summary: `target=${targetCharacterId}, effect=${effectName}, duration=${durationType}:${durationValue}`,
        output_summary: `effect_id=${effectId}, modifiers=${modifiers.length}`,
      },
    };
  }
}
