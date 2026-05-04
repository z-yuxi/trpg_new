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
 *
 * @spec K.10 - 角色卡开放交换格式规范（CSON）
 *   - Schema version 必须为 '1.0'
 *   - Character 对象包含：name, ruleset_ref, attributes, skills, resources, equipment, background
 *   - Meta 对象记录导出时间戳、导出者、平台版本
 *   - Source 对象可选，用于记录原始活动/角色代码
 *
 * @spec K.11 - 版本兼容性与向后兼容
 *   - schema_version 字段允许未来版本升级，当前固定为 '1.0'
 *   - 所有字段均为标准 JSON 类型，无外部依赖
 *   - 导出格式稳定，支持长期存档和跨平台交换
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
 *
 * @spec K.10 - 角色卡开放交换格式规范（CSON）
 *   - 支持标准 JSON 格式的 CSON 文档导入
 *   - 自动验证 schema 合规性（见 validateCSON）
 *   - 提取 character 对象中的所有字段并映射到本地角色卡格式
 *
 * @spec K.11 - 版本兼容性与向后兼容
 *   - 要求 schema_version === '1.0'，确保版本一致性
 *   - 若版本不匹配，抛出错误而非沉默失败，便于问题排查
 *
 * @throws {Error} 若 CSON 格式不合法或必需字段缺失
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
 *
 * @spec K.10 - 角色卡开放交换格式规范（CSON）
 *   - 必需字段验证：schema_version, meta, character, character.name, character.ruleset_ref, character.attributes, character.skills, character.equipment
 *   - 字段类型检查：确保 JSON 类型匹配（object, string, array）
 *   - 提供详细的验证错误列表，便于用户调试
 *
 * @spec K.11 - 版本兼容性与向后兼容
 *   - schema_version 必须为 '1.0'，其他版本拒绝
 *   - 此检查确保跨版本的格式稳定性和可升级性
 *
 * @returns 对象包含 valid 布尔值和 errors 数组；valid=true 表示可安全导入
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
