import { db } from '../db';
import { generateId, generateCharacterCode } from '@trpg/shared';
import type { CharacterSheet } from '@trpg/shared';

function rowToSheet(row: Record<string, unknown>): CharacterSheet {
  const parseJson = (val: unknown) =>
    typeof val === 'string' ? JSON.parse(val as string) : val;

  return {
    id: row['id'] as string,
    character_code: row['character_code'] as string,
    user_id: row['user_id'] as string,
    ruleset_id: row['ruleset_id'] as string,
    name: row['name'] as string,
    occupation_id: row['occupation_id'] as string | null,
    avatar_url: row['avatar_url'] as string,
    attributes: parseJson(row['attributes']) as Record<string, number>,
    skills: parseJson(row['skills']) as Record<string, number>,
    derived_max: parseJson(row['derived_max']) as CharacterSheet['derived_max'],
    equipment: parseJson(row['equipment']) as string[],
    background: row['background'] as string,
    avatar_custom_data: row['avatar_custom_data'] ? parseJson(row['avatar_custom_data']) as object : null,
    initial_snapshot: row['initial_snapshot'] ? parseJson(row['initial_snapshot']) as object : null,
    created_at: row['created_at'] as Date,
    updated_at: row['updated_at'] as Date,
  };
}

export class CharacterSheetService {
  async create(params: {
    user_id: string;
    ruleset_id: string;
    name: string;
    occupation_id?: string;
    avatar_url?: string;
    attributes?: Record<string, number>;
    skills?: Record<string, number>;
    background?: string;
  }): Promise<CharacterSheet> {
    const id = generateId();
    const character_code = await this.generateUniqueCode();

    await db('character_sheets').insert({
      id,
      character_code,
      user_id: params.user_id,
      ruleset_id: params.ruleset_id,
      name: params.name,
      occupation_id: params.occupation_id ?? null,
      avatar_url: params.avatar_url ?? '',
      attributes: JSON.stringify(params.attributes ?? {}),
      skills: JSON.stringify(params.skills ?? {}),
      derived_max: JSON.stringify({}),
      equipment: JSON.stringify([]),
      background: params.background ?? '',
      avatar_custom_data: null,
      initial_snapshot: null,
    });

    return this.findById(id) as Promise<CharacterSheet>;
  }

  async findById(id: string): Promise<CharacterSheet | null> {
    const row = await db('character_sheets').where({ id }).first();
    if (!row) return null;
    return rowToSheet(row);
  }

  async findByUserId(user_id: string): Promise<CharacterSheet[]> {
    const rows = await db('character_sheets').where({ user_id }).orderBy('created_at', 'desc');
    return rows.map(rowToSheet);
  }

  async update(id: string, updates: Partial<Omit<CharacterSheet, 'id' | 'character_code' | 'user_id' | 'created_at'>>): Promise<CharacterSheet> {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date() };

    for (const [key, value] of Object.entries(updates)) {
      if (['attributes', 'skills', 'derived_max', 'equipment', 'avatar_custom_data', 'initial_snapshot'].includes(key)) {
        dbUpdates[key] = JSON.stringify(value);
      } else {
        dbUpdates[key] = value;
      }
    }

    await db('character_sheets').where({ id }).update(dbUpdates);
    return this.findById(id) as Promise<CharacterSheet>;
  }

  async delete(id: string): Promise<void> {
    await db('character_sheets').where({ id }).delete();
  }

  private async generateUniqueCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateCharacterCode();
      const existing = await db('character_sheets').where({ character_code: code }).first();
      if (!existing) return code;
    }
    throw new Error('Failed to generate unique character code');
  }
}

export class CharacterInstanceService {
  async getOrCreate(params: {
    character_id: string;
    campaign_id: string;
    user_id: string;
  }): Promise<Record<string, unknown>> {
    const existing = await db('character_scene_states')
      .where({ character_id: params.character_id, campaign_id: params.campaign_id })
      .first();

    if (existing) return existing as Record<string, unknown>;

    const id = generateId();
    await db('character_scene_states').insert({
      id,
      character_id: params.character_id,
      campaign_id: params.campaign_id,
      current_spatial_scene_id: null,
      personal_story_time: JSON.stringify({ day: 1, hour: 8, minute: 0 }),
    });

    return db('character_scene_states').where({ id }).first() as Promise<Record<string, unknown>>;
  }
}

export const characterSheetService = new CharacterSheetService();
export const characterInstanceService = new CharacterInstanceService();
