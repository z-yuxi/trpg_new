import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { Module, ModuleQueryFilter, CreateModuleRequest, UpdateModuleRequest } from '@trpg/shared';

function rowToModule(row: Record<string, unknown>, includeContent = false): Module {
  const m: Module = {
    id: row['id'] as string,
    name: row['name'] as string,
    author_id: row['author_id'] as string,
    author_name: (row['author_name'] as string) ?? undefined,
    ruleset_id: row['ruleset_id'] as string,
    ruleset_name: (row['ruleset_name'] as string) ?? undefined,
    description: (row['description'] as string) ?? '',
    cover_url: (row['cover_url'] as string) ?? '',
    status: row['status'] as Module['status'],
    difficulty: (row['difficulty'] as Module['difficulty']) ?? null,
    min_players: row['min_players'] ? Number(row['min_players']) : null,
    max_players: row['max_players'] ? Number(row['max_players']) : null,
    style: (row['style'] as string) ?? null,
    price: Number(row['price'] ?? 0),
    rating: Number(row['rating'] ?? 0),
    download_count: Number(row['download_count'] ?? 0),
    word_count: Number(row['word_count'] ?? 0),
    auto_saved_at: row['auto_saved_at'] ? (row['auto_saved_at'] as Date) : null,
    created_at: row['created_at'] as Date,
    updated_at: row['updated_at'] as Date,
  };
  if (includeContent) {
    m.content = (row['content'] as string) ?? null;
    const outlineRaw = row['outline'];
    if (outlineRaw) {
      try {
        m.outline = typeof outlineRaw === 'string' ? JSON.parse(outlineRaw) : outlineRaw;
      } catch {
        m.outline = null;
      }
    } else {
      m.outline = null;
    }
  }
  return m;
}

export class ModuleService {
  async listPublic(filters: ModuleQueryFilter): Promise<{ data: Module[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20));

    let query = db('modules as m')
      .leftJoin('users as u', 'u.id', 'm.author_id')
      .leftJoin('rulesets as r', 'r.id', 'm.ruleset_id')
      .where('m.status', 'public');

    if (filters.keyword) {
      query = query.andWhere((builder) => {
        builder
          .whereILike('m.name', `%${filters.keyword}%`)
          .orWhereILike('m.description', `%${filters.keyword}%`);
      });
    }
    if (filters.ruleset_id) query = query.andWhere('m.ruleset_id', filters.ruleset_id);

    const totalRow = await query.clone().count<{ count: number }[]>({ count: '*' }).first();

    if (filters.sort === 'rating') {
      query = query.orderBy('m.rating', 'desc').orderBy('m.created_at', 'desc');
    } else if (filters.sort === 'new') {
      query = query.orderBy('m.created_at', 'desc');
    } else {
      query = query.orderBy('m.download_count', 'desc').orderBy('m.rating', 'desc');
    }

    const rows = await query
      .select('m.*', 'u.nickname as author_name', 'r.name as ruleset_name')
      .offset((page - 1) * limit)
      .limit(limit);

    return {
      data: rows.map((row) => rowToModule(row as Record<string, unknown>)),
      total: Number(totalRow?.count ?? 0),
    };
  }

  async listMine(userId: string): Promise<Module[]> {
    const rows = await db('modules as m')
      .leftJoin('users as u', 'u.id', 'm.author_id')
      .leftJoin('rulesets as r', 'r.id', 'm.ruleset_id')
      .leftJoin('user_module_purchases as ump', 'ump.module_id', 'm.id')
      .where((builder) => {
        builder.where('m.author_id', userId).orWhere('ump.user_id', userId);
      })
      .select('m.*', 'u.nickname as author_name', 'r.name as ruleset_name')
      .orderBy('m.updated_at', 'desc');

    const deduped = new Map<string, Module>();
    rows.forEach((row) => {
      const mapped = rowToModule(row as Record<string, unknown>);
      deduped.set(mapped.id, mapped);
    });
    return [...deduped.values()];
  }

  async getById(id: string): Promise<Module | null> {
    const row = await db('modules as m')
      .leftJoin('users as u', 'u.id', 'm.author_id')
      .leftJoin('rulesets as r', 'r.id', 'm.ruleset_id')
      .where('m.id', id)
      .select('m.*', 'u.nickname as author_name', 'r.name as ruleset_name')
      .first();
    if (!row) return null;
    return rowToModule(row as Record<string, unknown>, true);
  }

  async create(authorId: string, data: CreateModuleRequest): Promise<Module> {
    const id = generateId();
    await db('modules').insert({
      id,
      name: data.name,
      author_id: authorId,
      ruleset_id: data.ruleset_id,
      description: data.description ?? '',
      cover_url: '',
      status: 'draft',
      price: 0,
      rating: 0,
      download_count: 0,
      word_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    });
    return (await this.getById(id))!;
  }

  async update(id: string, userId: string, data: UpdateModuleRequest): Promise<Module | null> {
    const existing = await db('modules').where({ id, author_id: userId }).first();
    if (!existing) return null;
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (data.name !== undefined) updates['name'] = data.name;
    if (data.description !== undefined) updates['description'] = data.description;
    if (data.content !== undefined) updates['content'] = data.content;
    await db('modules').where({ id }).update(updates);
    return this.getById(id);
  }

  async autoSave(id: string, userId: string, content: string, wordCount?: number): Promise<boolean> {
    const existing = await db('modules').where({ id, author_id: userId }).first();
    if (!existing) return false;
    await db('modules').where({ id }).update({
      content,
      word_count: wordCount ?? 0,
      auto_saved_at: new Date(),
      updated_at: new Date(),
    });
    return true;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const existing = await db('modules').where({ id, author_id: userId, status: 'draft' }).first();
    if (!existing) return false;
    await db('modules').where({ id }).delete();
    return true;
  }

  async seedIfEmpty(authorId: string): Promise<void> {
    const existing = await db('modules').first();
    if (existing) return;

    const ruleset = await db('rulesets').where({ status: 'published' }).first();
    if (!ruleset) return;

    await db('modules').insert([
      {
        id: generateId(),
        name: '雾港夜航',
        author_id: authorId,
        ruleset_id: ruleset.id,
        description: '一段适合 3-5 人的港口调查冒险，偏悬疑与慢压迫。',
        cover_url: '',
        status: 'public',
        difficulty: 'normal',
        min_players: 3,
        max_players: 5,
        style: 'mystery',
        price: 0,
        rating: 4.6,
        download_count: 128,
      },
      {
        id: generateId(),
        name: '赤灰回响',
        author_id: authorId,
        ruleset_id: ruleset.id,
        description: '短篇恐怖模组，节奏更快，适合单次团。',
        cover_url: '',
        status: 'public',
        difficulty: 'hard',
        min_players: 2,
        max_players: 4,
        style: 'horror',
        price: 12,
        rating: 4.8,
        download_count: 64,
      },
    ]);
  }
}

export const moduleService = new ModuleService();