import { db } from '../db';
import { generateId, generateCharacterCode, calcDerived, COC7_DEFAULT_DERIVED } from '@trpg/shared';
import type { CharacterSheet, CharacterSceneState } from '@trpg/shared';

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
  private parseJson(val: unknown) {
    if (val == null) return null;
    return typeof val === 'string' ? JSON.parse(val as string) : val;
  }

  private rowToState(row: Record<string, unknown>): CharacterSceneState {
    return {
      id: row['id'] as string,
      character_id: row['character_id'] as string,
      campaign_id: row['campaign_id'] as string,
      current_spatial_scene_id: row['current_spatial_scene_id'] as string | null,
      personal_story_time: this.parseJson(row['personal_story_time']) as CharacterSceneState['personal_story_time'],
      derived_current: this.parseJson(row['derived_current']) as CharacterSceneState['derived_current'],
      temporary_effects: this.parseJson(row['temporary_effects']) as CharacterSceneState['temporary_effects'],
      equipment: this.parseJson(row['equipment']) as string[] | null,
      skill_growth_marks: this.parseJson(row['skill_growth_marks']) as Record<string, boolean> | null,
    };
  }

  /**
   * 获取或创建角色的团内实例
   * 创建时：
   *  - 从 character_sheets 计算派生值
   *  - 初始化 personal_story_time = campaign.global_story_time
   *  - 加入团的第一个 spatial 场景
   */
  async getOrCreate(params: {
    character_id: string;
    campaign_id: string;
    user_id: string;
  }): Promise<CharacterSceneState> {
    const existing = await db('character_scene_states')
      .where({ character_id: params.character_id, campaign_id: params.campaign_id })
      .first();

    if (existing) return this.rowToState(existing as Record<string, unknown>);

    // 获取角色模板
    const sheet = await db('character_sheets').where({ id: params.character_id }).first();
    if (!sheet) throw new Error('Character sheet not found');

    const attrs: Record<string, number> = typeof sheet['attributes'] === 'string'
      ? JSON.parse(sheet['attributes'] as string) : (sheet['attributes'] as Record<string, number> ?? {});

    // 获取规则集派生公式
    let derivedFormulas: typeof COC7_DEFAULT_DERIVED | null = null;
    const ruleset = await db('rulesets').where({ id: sheet['ruleset_id'] }).select('character_card_schema').first().catch(() => null);
    if (ruleset) {
      const schema = typeof ruleset['character_card_schema'] === 'string'
        ? JSON.parse(ruleset['character_card_schema'] as string)
        : ruleset['character_card_schema'];
      if (schema?.derived_formulas) derivedFormulas = schema.derived_formulas;
    }

    const formulas = derivedFormulas ?? (
      ('CON' in attrs && 'SIZ' in attrs && 'POW' in attrs) ? COC7_DEFAULT_DERIVED : {}
    );
    const derivedNums = Object.keys(formulas).length > 0 ? calcDerived(attrs, formulas) : {};

    // 转换为 { current, max } 格式
    const derived_current: Record<string, { current: number; max: number }> = {};
    for (const [k, v] of Object.entries(derivedNums)) {
      derived_current[k.toLowerCase()] = { current: v, max: v };
    }

    // 获取 campaign 全局故事时间
    const campaign = await db('campaigns').where({ id: params.campaign_id })
      .select('global_story_time').first();
    const personalTime = campaign?.['global_story_time']
      ? (typeof campaign['global_story_time'] === 'string'
        ? JSON.parse(campaign['global_story_time'] as string)
        : campaign['global_story_time'])
      : { day: 1, hour: 8, minute: 0 };

    const id = generateId();
    await db('character_scene_states').insert({
      id,
      character_id: params.character_id,
      campaign_id: params.campaign_id,
      current_spatial_scene_id: null,
      personal_story_time: JSON.stringify(personalTime),
      derived_current: JSON.stringify(derived_current),
      temporary_effects: JSON.stringify([]),
      equipment: typeof sheet['equipment'] === 'string' ? sheet['equipment'] : JSON.stringify(sheet['equipment'] ?? []),
      skill_growth_marks: JSON.stringify({}),
    });

    // 加入第一个 spatial 场景
    const firstScene = await db('scenes')
      .where({ campaign_id: params.campaign_id, type: 'spatial' })
      .orderBy('created_at', 'asc')
      .select('id')
      .first();
    if (firstScene) {
      const { joinScene } = await import('./scene-participation.js');
      await joinScene(params.character_id, params.campaign_id, firstScene['id'] as string, 'join');
    }

    const row = await db('character_scene_states').where({ id }).first();
    return this.rowToState(row as Record<string, unknown>);
  }

  async getInstance(characterId: string, campaignId: string): Promise<CharacterSceneState | null> {
    const row = await db('character_scene_states')
      .where({ character_id: characterId, campaign_id: campaignId })
      .first();
    if (!row) return null;
    return this.rowToState(row as Record<string, unknown>);
  }

  async updateInstance(
    characterId: string,
    campaignId: string,
    updates: {
      derived_current?: Record<string, { current: number; max: number; temp?: number }>;
      temporary_effects?: Array<{ name: string; value: number; source?: string }>;
      equipment?: string[];
      current_spatial_scene_id?: string | null;
      personal_story_time?: CharacterSceneState['personal_story_time'];
    }
  ): Promise<CharacterSceneState> {
    const dbUpdates: Record<string, unknown> = {};
    if (updates.derived_current !== undefined) dbUpdates['derived_current'] = JSON.stringify(updates.derived_current);
    if (updates.temporary_effects !== undefined) dbUpdates['temporary_effects'] = JSON.stringify(updates.temporary_effects);
    if (updates.equipment !== undefined) dbUpdates['equipment'] = JSON.stringify(updates.equipment);
    if (updates.current_spatial_scene_id !== undefined) dbUpdates['current_spatial_scene_id'] = updates.current_spatial_scene_id;
    if (updates.personal_story_time !== undefined) dbUpdates['personal_story_time'] = JSON.stringify(updates.personal_story_time);

    await db('character_scene_states')
      .where({ character_id: characterId, campaign_id: campaignId })
      .update(dbUpdates);

    const row = await db('character_scene_states')
      .where({ character_id: characterId, campaign_id: campaignId })
      .first();
    return this.rowToState(row as Record<string, unknown>);
  }

  /**
   * 技能成长：同步到 character_sheets 模板，并清除 skill_growth_marks
   */
  async growSkill(
    characterId: string,
    campaignId: string,
    skillName: string,
    newValue: number
  ): Promise<void> {
    // 更新模板技能
    const sheet = await db('character_sheets').where({ id: characterId }).first();
    if (!sheet) throw new Error('Character sheet not found');
    const skills: Record<string, number> = typeof sheet['skills'] === 'string'
      ? JSON.parse(sheet['skills'] as string) : (sheet['skills'] ?? {});
    skills[skillName] = newValue;
    await db('character_sheets').where({ id: characterId }).update({
      skills: JSON.stringify(skills),
      updated_at: new Date(),
    });

    // 清除团内实例的成长标记
    const state = await db('character_scene_states')
      .where({ character_id: characterId, campaign_id: campaignId })
      .first();
    if (state) {
      const marks: Record<string, boolean> = typeof state['skill_growth_marks'] === 'string'
        ? JSON.parse(state['skill_growth_marks'] as string) : (state['skill_growth_marks'] ?? {});
      delete marks[skillName];
      await db('character_scene_states')
        .where({ character_id: characterId, campaign_id: campaignId })
        .update({ skill_growth_marks: JSON.stringify(marks) });
    }
  }

  /**
   * 标记技能待成长（/en 成功时调用）
   */
  async markSkillForGrowth(characterId: string, campaignId: string, skillName: string): Promise<void> {
    const state = await db('character_scene_states')
      .where({ character_id: characterId, campaign_id: campaignId })
      .first();
    if (!state) return;
    const marks: Record<string, boolean> = typeof state['skill_growth_marks'] === 'string'
      ? JSON.parse(state['skill_growth_marks'] as string) : (state['skill_growth_marks'] ?? {});
    marks[skillName] = true;
    await db('character_scene_states')
      .where({ character_id: characterId, campaign_id: campaignId })
      .update({ skill_growth_marks: JSON.stringify(marks) });
  }
}

export const characterSheetService = new CharacterSheetService();
export const characterInstanceService = new CharacterInstanceService();
