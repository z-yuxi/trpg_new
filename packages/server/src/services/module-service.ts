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
    submitted_at: row['submitted_at'] ? (row['submitted_at'] as Date) : null,
    public_notice_end_at: row['public_notice_end_at'] ? (row['public_notice_end_at'] as Date) : null,
    suspended_reason: (row['suspended_reason'] as string) ?? null,
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
    const metadataRaw = row['metadata'];
    if (metadataRaw) {
      try {
        m.metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
      } catch {
        m.metadata = undefined;
      }
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
      const kw = `%${filters.keyword.replace(/[%_\\]/g, '\\$&')}%`;
      query = query.andWhere((builder) => {
        builder
          .whereILike('m.name', kw)
          .orWhereILike('m.description', kw);
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

  async applyImportedContent(
    id: string,
    userId: string,
    data: { name?: string; description?: string; content: string; word_count?: number },
  ): Promise<Module | null> {
    const existing = await db('modules').where({ id, author_id: userId }).first();
    if (!existing) return null;

    const updates: Record<string, unknown> = {
      content: data.content,
      word_count: data.word_count ?? 0,
      auto_saved_at: new Date(),
      updated_at: new Date(),
    };

    if (data.name !== undefined) updates['name'] = data.name;
    if (data.description !== undefined) updates['description'] = data.description;

    await db('modules').where({ id }).update(updates);
    return this.getById(id);
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const existing = await db('modules').where({ id, author_id: userId, status: 'draft' }).first();
    if (!existing) return false;
    await db('modules').where({ id }).delete();
    return true;
  }

  /**
   * 提交发布审核：draft → reviewing，同时创建内容快照
   */
  async submitForReview(id: string, userId: string): Promise<Module | null> {
    const m = await db('modules').where({ id, author_id: userId, status: 'draft' }).first();
    if (!m) return null;

    // 内容快照
    const snapshot = m.content ? JSON.stringify({ content: m.content, atoms: [] }) : null;
    const now = new Date();

    await db('modules').where({ id }).update({
      status: 'reviewing',
      review_snapshot: snapshot,
      submitted_at: now,
    });

    // 审计日志
    await db('module_status_logs').insert({
      id: generateId(),
      module_id: id,
      from_status: 'draft',
      to_status: 'reviewing',
      operator_user_id: userId,
      reason: null,
      created_at: now,
    });

    // V1.0 直接过审，转为公示状态
    await this.startPublicNotice(id);

    return this.getById(id);
  }

  /**
   * 开始公示期（reviewing → public_notice，公示 7 天）
   */
  async startPublicNotice(id: string): Promise<void> {
    const m = await db('modules').where({ id }).first();
    if (!m) return;

    const now = new Date();
    const endAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 天

    await db('modules').where({ id }).update({
      status: 'public_notice',
      public_notice_end_at: endAt,
    });

    await db('module_status_logs').insert({
      id: generateId(),
      module_id: id,
      from_status: m.status,
      to_status: 'public_notice',
      operator_user_id: null, // 系统自动
      reason: null,
      created_at: now,
    });
  }

  /**
   * 公示期完成（public_notice → published），由定时任务或手动调用
   */
  async completePublicNotice(id: string): Promise<void> {
    const m = await db('modules').where({ id }).first();
    if (!m || m.status !== 'public_notice') return;

    const now = new Date();
    await db('modules').where({ id }).update({
      status: 'public',
      updated_at: now,
    });

    await db('module_status_logs').insert({
      id: generateId(),
      module_id: id,
      from_status: 'public_notice',
      to_status: 'public',
      operator_user_id: null,
      reason: null,
      created_at: now,
    });
  }

  /**
   * 完成所有过期公示期的模组
   */
  async completeExpiredPublicNotices(): Promise<void> {
    const expired = await db('modules')
      .where({ status: 'public_notice' })
      .where('public_notice_end_at', '<=', new Date());

    for (const m of expired) {
      await this.completePublicNotice(m.id);
    }
  }

  /**
   * 撤回模组（reviewing/public_notice → draft）
   */
  async withdraw(id: string, userId: string): Promise<Module | null> {
    const m = await db('modules').where({ id, author_id: userId }).first();
    if (!m || !['reviewing', 'public_notice'].includes(m.status)) return null;

    const fromStatus = m.status;
    const now = new Date();

    await db('modules').where({ id }).update({
      status: 'draft',
      review_snapshot: null,
      submitted_at: null,
      public_notice_end_at: null,
    });

    await db('module_status_logs').insert({
      id: generateId(),
      module_id: id,
      from_status: fromStatus,
      to_status: 'draft',
      operator_user_id: userId,
      reason: '作者撤回',
      created_at: now,
    });

    return this.getById(id);
  }

  /**
   * 下架模组（任何状态 → suspended）
   */
  async suspend(id: string, reason: string): Promise<void> {
    const m = await db('modules').where({ id }).first();
    if (!m) return;

    const now = new Date();
    await db('modules').where({ id }).update({
      status: 'suspended',
      suspended_reason: reason,
    });

    await db('module_status_logs').insert({
      id: generateId(),
      module_id: id,
      from_status: m.status,
      to_status: 'suspended',
      operator_user_id: null, // 系统操作
      reason,
      created_at: now,
    });
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