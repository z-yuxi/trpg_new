export type RecruitmentFieldType = 'text' | 'number' | 'boolean' | 'select' | 'number_range';

export interface RecruitmentFieldOption {
  label: string;
  value: string;
}

export interface RecruitmentField {
  name: string;
  label: string;
  type: RecruitmentFieldType;
  placeholder?: string;
  default?: unknown;
  options?: RecruitmentFieldOption[] | string[];
  multiple?: boolean;
  minLabel?: string;
  maxLabel?: string;
}

interface RulesetLike {
  id: string;
  name: string;
  character_card_schema?: unknown;
  recruitment_fields?: unknown;
}

function toFieldArray(value: unknown): RecruitmentField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is RecruitmentField => typeof item === 'object' && item !== null && typeof (item as RecruitmentField).name === 'string' && typeof (item as RecruitmentField).label === 'string')
    .map((item) => ({
      ...item,
      options: Array.isArray(item.options) ? item.options : undefined,
    }));
}

export function resolveRecruitmentFields(ruleset?: RulesetLike | null): RecruitmentField[] {
  if (!ruleset) return [];

  const candidate = ruleset as RulesetLike & { character_card_schema?: { recruitment_fields?: unknown } };
  const directFields = toFieldArray(candidate.recruitment_fields);
  if (directFields.length > 0) return directFields;

  const schemaFields = toFieldArray(candidate.character_card_schema && typeof candidate.character_card_schema === 'object'
    ? (candidate.character_card_schema as { recruitment_fields?: unknown }).recruitment_fields
    : undefined);
  if (schemaFields.length > 0) return schemaFields;

  return [];
}

export function createRecruitmentMetadata(fields: RecruitmentField[]): Record<string, unknown> {
  return fields.reduce<Record<string, unknown>>((result, field) => {
    if (field.default !== undefined) {
      result[field.name] = field.default;
      return result;
    }
    if (field.type === 'boolean') result[field.name] = false;
    else if (field.type === 'select' && field.multiple) result[field.name] = [];
    else if (field.type === 'number_range') result[field.name] = { min: null, max: null };
    else result[field.name] = '';
    return result;
  }, {});
}

export function hasRecruitmentValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some((item) => hasRecruitmentValue(item));
  if (typeof value === 'boolean') return value;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function formatRecruitmentValue(value: unknown): string {
  if (Array.isArray(value)) return value.join('、');
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    if ('min' in objectValue || 'max' in objectValue) {
      const min = objectValue.min ?? '-';
      const max = objectValue.max ?? '-';
      return `${min} - ${max}`;
    }
    return Object.entries(objectValue)
      .filter(([, item]) => hasRecruitmentValue(item))
      .map(([key, item]) => `${key}: ${formatRecruitmentValue(item)}`)
      .join(' / ');
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value ?? '');
}
