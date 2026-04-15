import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { RecruitmentPost, Ruleset } from '@trpg/shared';

function rowToPost(row: Record<string, unknown>): RecruitmentPost {
  return {
    id: row['id'] as string,
    poster_id: row['poster_id'] as string,
    type: row['type'] as RecruitmentPost['type'],
    title: row['title'] as string,
    campaign_id: row['campaign_id'] as string | null,
    ruleset_id: row['ruleset_id'] as string,
    player_count_max: row['player_count_max'] as number,
    status: row['status'] as RecruitmentPost['status'],
    created_at: row['created_at'] as Date,
  };
}

export class RecruitmentService {
  async create(params: {
    poster_id: string;
    type: RecruitmentPost['type'];
    title: string;
    ruleset_id: string;
    player_count_max: number;
    campaign_id?: string;
  }): Promise<RecruitmentPost> {
    const id = generateId();
    await db('recruitment_posts').insert({
      id,
      poster_id: params.poster_id,
      type: params.type,
      title: params.title,
      campaign_id: params.campaign_id ?? null,
      ruleset_id: params.ruleset_id,
      player_count_max: params.player_count_max,
      status: 'open',
    });
    return this.findById(id) as Promise<RecruitmentPost>;
  }

  async findById(id: string): Promise<RecruitmentPost | null> {
    const row = await db('recruitment_posts').where({ id }).first();
    if (!row) return null;
    return rowToPost(row);
  }

  async list(filters?: { status?: string; type?: string }): Promise<RecruitmentPost[]> {
    let query = db('recruitment_posts').orderBy('created_at', 'desc');
    if (filters?.status) query = query.where({ status: filters.status });
    if (filters?.type) query = query.where({ type: filters.type });
    const rows = await query;
    return rows.map(rowToPost);
  }

  async update(id: string, updates: Partial<Pick<RecruitmentPost, 'title' | 'status'>>): Promise<RecruitmentPost> {
    await db('recruitment_posts').where({ id }).update(updates);
    return this.findById(id) as Promise<RecruitmentPost>;
  }
}

function rowToRuleset(row: Record<string, unknown>): Ruleset {
  const parseJson = (val: unknown) =>
    typeof val === 'string' ? JSON.parse(val as string) : val ?? {};

  return {
    id: row['id'] as string,
    name: row['name'] as string,
    version: row['version'] as string,
    parent_ruleset_id: row['parent_ruleset_id'] as string | null,
    atoms: parseJson(row['atoms']),
    connections: parseJson(row['connections']),
    commands: parseJson(row['commands']),
    character_card_schema: parseJson(row['character_card_schema']),
    status: row['status'] as Ruleset['status'],
    created_at: row['created_at'] as Date,
  };
}

export class RulesetService {
  async create(params: {
    name: string;
    version: string;
    parent_ruleset_id?: string;
    atoms?: object;
    commands?: object;
    character_card_schema?: object;
  }): Promise<Ruleset> {
    const id = generateId();
    await db('rulesets').insert({
      id,
      name: params.name,
      version: params.version,
      parent_ruleset_id: params.parent_ruleset_id ?? null,
      atoms: JSON.stringify(params.atoms ?? {}),
      connections: JSON.stringify([]),
      commands: JSON.stringify(params.commands ?? {}),
      character_card_schema: JSON.stringify(params.character_card_schema ?? {}),
      status: 'draft',
    });
    return this.findById(id) as Promise<Ruleset>;
  }

  async findById(id: string): Promise<Ruleset | null> {
    const row = await db('rulesets').where({ id }).first();
    if (!row) return null;
    return rowToRuleset(row);
  }

  async list(status?: Ruleset['status']): Promise<Ruleset[]> {
    let query = db('rulesets').orderBy('created_at', 'desc');
    if (status) query = query.where({ status });
    const rows = await query;
    return rows.map(rowToRuleset);
  }

  async update(id: string, updates: Partial<Omit<Ruleset, 'id' | 'created_at'>>): Promise<Ruleset> {
    const dbUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (['atoms', 'connections', 'commands', 'character_card_schema'].includes(key)) {
        dbUpdates[key] = JSON.stringify(value);
      } else {
        dbUpdates[key] = value;
      }
    }
    await db('rulesets').where({ id }).update(dbUpdates);
    return this.findById(id) as Promise<Ruleset>;
  }
}

export class ModuleService {
  // Module service is a placeholder for future module system
  async findById(_id: string): Promise<null> {
    return null;
  }
}

export const recruitmentService = new RecruitmentService();
export const rulesetService = new RulesetService();
export const moduleService = new ModuleService();
