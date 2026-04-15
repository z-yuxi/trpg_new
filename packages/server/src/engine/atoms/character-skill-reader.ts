import type { AtomNode, AtomOutput } from '../atom-interface';

interface CharacterData {
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number }>;
}

type FieldType = 'attribute' | 'skill' | 'resource_current' | 'resource_max';

export class CharacterSkillReaderAtom implements AtomNode {
  type = 'character_skill_reader';

  execute(inputs: Record<string, unknown>): AtomOutput {
    const character_data = inputs['character_data'] as CharacterData;
    const field_type = inputs['field_type'] as FieldType;
    const field_name = inputs['field_name'] as string;

    if (!character_data || typeof character_data !== 'object') {
      throw new Error("character_skill_reader: 'character_data' must be an object");
    }
    if (!field_name || typeof field_name !== 'string') {
      throw new Error("character_skill_reader: 'field_name' must be a non-empty string");
    }

    let value: number;

    switch (field_type) {
      case 'attribute': {
        if (!(field_name in character_data.attributes)) {
          throw new Error(`character_skill_reader: attribute '${field_name}' not found in character_data`);
        }
        value = character_data.attributes[field_name];
        break;
      }
      case 'skill': {
        if (!(field_name in character_data.skills)) {
          throw new Error(`character_skill_reader: skill '${field_name}' not found in character_data`);
        }
        value = character_data.skills[field_name];
        break;
      }
      case 'resource_current': {
        if (!(field_name in character_data.resources)) {
          throw new Error(`character_skill_reader: resource '${field_name}' not found in character_data`);
        }
        value = character_data.resources[field_name].current;
        break;
      }
      case 'resource_max': {
        if (!(field_name in character_data.resources)) {
          throw new Error(`character_skill_reader: resource '${field_name}' not found in character_data`);
        }
        value = character_data.resources[field_name].max;
        break;
      }
      default:
        throw new Error(`character_skill_reader: invalid field_type '${field_type}'`);
    }

    return {
      result: { value, field_type, field_name },
      logs: {
        input_summary: `field_type=${field_type}, field_name=${field_name}`,
        output_summary: `value=${value}`,
      },
    };
  }
}
