/** CSON 文档结构 */
export interface CSONDocument {
  schema_version: '1.0';
  meta: CSONMetadata;
  character: CSONCharacter;
  source?: CSONSource;
}

export interface CSONMetadata {
  created_at: string;
  exported_by: string;
  platform_version: string;
}

export interface CSONCharacter {
  name: string;
  ruleset_ref: string;
  occupation_id?: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  resources: Record<string, { current: number; max: number }>;
  equipment: string[];
  background?: string;
  avatar_custom_data?: object;
}

export interface CSONSource {
  campaign_id?: string;
  character_code?: string;
}

/**
 * 将角色卡数据导出为 CSON JSON 字符串
 */
export function exportCSON(
  sheet: {
    name: string;
    ruleset_id: string;
    occupation_id?: string | null;
    attributes: Record<string, number>;
    skills: Record<string, number>;
    derived_max: Record<string, { current: number; max: number }>;
    equipment: string[];
    background?: string;
    avatar_custom_data?: object | null;
    character_code?: string;
  },
  exporterName: string
): string {
  const doc: CSONDocument = {
    schema_version: '1.0',
    meta: {
      created_at: new Date().toISOString(),
      exported_by: exporterName,
      platform_version: '0.1.0',
    },
    character: {
      name: sheet.name,
      ruleset_ref: sheet.ruleset_id,
      occupation_id: sheet.occupation_id ?? undefined,
      attributes: sheet.attributes,
      skills: sheet.skills,
      resources: sheet.derived_max,
      equipment: sheet.equipment,
      background: sheet.background,
      avatar_custom_data: sheet.avatar_custom_data ?? undefined,
    },
    source: {
      character_code: sheet.character_code,
    },
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * 从 CSON JSON 字符串导入
 */
export function importCSON(jsonString: string): {
  name: string;
  ruleset_id: string;
  occupation_id?: string;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  derived_max: Record<string, { current: number; max: number }>;
  equipment: string[];
  background?: string;
  avatar_custom_data?: object;
} {
  const validation = validateCSON(jsonString);
  if (!validation.valid) {
    throw new Error(`Invalid CSON: ${validation.errors.join(', ')}`);
  }
  const doc = JSON.parse(jsonString) as CSONDocument;
  const char = doc.character;
  return {
    name: char.name,
    ruleset_id: char.ruleset_ref,
    occupation_id: char.occupation_id,
    attributes: char.attributes,
    skills: char.skills,
    derived_max: char.resources,
    equipment: char.equipment,
    background: char.background,
    avatar_custom_data: char.avatar_custom_data,
  };
}

/**
 * 校验 CSON 格式是否合法
 */
export function validateCSON(jsonString: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  let doc: any;
  try {
    doc = JSON.parse(jsonString);
  } catch {
    return { valid: false, errors: ['Invalid JSON'] };
  }

  if (doc.schema_version !== '1.0') errors.push('schema_version must be "1.0"');
  if (!doc.meta || typeof doc.meta !== 'object') errors.push('missing meta');
  if (!doc.character || typeof doc.character !== 'object') {
    errors.push('missing character');
    return { valid: errors.length === 0, errors };
  }

  const char = doc.character;
  if (typeof char.name !== 'string' || !char.name) errors.push('character.name is required');
  if (typeof char.ruleset_ref !== 'string' || !char.ruleset_ref) errors.push('character.ruleset_ref is required');
  if (typeof char.attributes !== 'object') errors.push('character.attributes must be an object');
  if (typeof char.skills !== 'object') errors.push('character.skills must be an object');
  if (!Array.isArray(char.equipment)) errors.push('character.equipment must be an array');

  return { valid: errors.length === 0, errors };
}
