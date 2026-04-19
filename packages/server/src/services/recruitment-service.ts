import { db } from '../db';
import { generateId } from '@trpg/shared';
import type { RecruitmentPost, Ruleset } from '@trpg/shared';
import { campaignService } from './campaign-service';

type BoardStatus = RecruitmentPost['status'] | 'grouped';

function parseJsonArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
      return [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToPost(row: Record<string, unknown>): RecruitmentPost {
  return {
    id: row['id'] as string,
    poster_id: row['poster_id'] as string,
    type: row['type'] as RecruitmentPost['type'],
    title: row['title'] as string,
    campaign_id: row['campaign_id'] as string | null,
    ruleset_id: row['ruleset_id'] as string,
    module_name: row['module_name'] as string | null,
    player_count_max: Number(row['player_count_max'] ?? 0),
    player_count_joined: Number(row['player_count_joined'] ?? 0),
    schedule_text: (row['schedule_text'] as string | null) ?? null,
    description: (row['description'] as string | null) ?? null,
    tags: parseJsonArray(row['tags']),
    status: row['status'] as RecruitmentPost['status'],
    created_at: row['created_at'] as Date,
  };
}

function postStatusView(post: RecruitmentPost): BoardStatus {
  if (post.status === 'closed' && post.campaign_id) return 'grouped';
  return post.status;
}

export class RecruitmentService {
  async create(params: {
    poster_id: string;
    type: RecruitmentPost['type'];
    title: string;
    ruleset_id: string;
    module_name?: string | null;
    player_count_max: number;
    schedule_text?: string | null;
    description?: string | null;
    tags?: string[];
  }): Promise<RecruitmentPost> {
    const id = generateId();
    await db('recruitment_posts').insert({
      id,
      poster_id: params.poster_id,
      type: params.type,
      title: params.title,
      ruleset_id: params.ruleset_id,
      module_name: params.module_name ?? null,
      player_count_max: params.player_count_max,
      player_count_joined: 0,
      schedule_text: params.schedule_text ?? null,
      description: params.description ?? null,
      tags: JSON.stringify(params.tags ?? []),
      status: 'open',
    });
    return this.findById(id) as Promise<RecruitmentPost>;
  }

  async findById(id: string): Promise<RecruitmentPost | null> {
    const row = await db('recruitment_posts').where({ id }).first();
    if (!row) return null;
    return rowToPost(row);
  }

  async list(params: {
    status?: BoardStatus;
    type?: RecruitmentPost['type'];
    ruleset_id?: string;
    keyword?: string;
    sort?: 'latest' | 'oldest';
    page?: number;
    limit?: number;
  }): Promise<{ data: Array<Record<string, unknown>>; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 10));

    let query = db('recruitment_posts as rp')
      .leftJoin('users as u', 'rp.poster_id', 'u.id')
      .leftJoin('rulesets as r', 'rp.ruleset_id', 'r.id');

    if (params.type) query = query.where('rp.type', params.type);
    if (params.ruleset_id) query = query.where('rp.ruleset_id', params.ruleset_id);
    if (params.keyword) query = query.where('rp.title', 'like', `%${params.keyword}%`);

    if (params.status) {
      if (params.status === 'grouped') {
        query = query.where('rp.status', 'closed').whereNotNull('rp.campaign_id');
      } else {
        query = query.where('rp.status', params.status);
      }
    }

    const countRow = await query.clone().count<{ total: number }[]>({ total: '*' }).first();
    const total = Number(countRow?.total ?? 0);

    const rows = await query
      .select(
        'rp.*',
        'u.nickname as poster_nickname',
        'r.name as ruleset_name',
      )
      .orderBy('rp.created_at', params.sort === 'oldest' ? 'asc' : 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    const data = rows.map((row: Record<string, unknown>) => {
      const post = rowToPost(row);
      return {
        ...post,
        status_view: postStatusView(post),
        poster_nickname: row['poster_nickname'] ?? '匿名玩家',
        ruleset_name: row['ruleset_name'] ?? post.ruleset_id,
      };
    });

    return { data, total, page, limit };
  }

  async getDetail(postId: string, viewerId?: string): Promise<Record<string, unknown> | null> {
    const row = await db('recruitment_posts as rp')
      .leftJoin('users as u', 'rp.poster_id', 'u.id')
      .leftJoin('rulesets as r', 'rp.ruleset_id', 'r.id')
      .where('rp.id', postId)
      .select('rp.*', 'u.nickname as poster_nickname', 'r.name as ruleset_name')
      .first();

    if (!row) return null;

    const post = rowToPost(row);

    const comments = await db('recruitment_comments as c')
      .leftJoin('users as u', 'c.user_id', 'u.id')
      .where('c.post_id', postId)
      .select('c.id', 'c.post_id', 'c.user_id', 'c.content', 'c.created_at', 'u.nickname as user_nickname')
      .orderBy('c.created_at', 'asc');

    let applications: Array<Record<string, unknown>> = [];
    if (viewerId && viewerId === post.poster_id) {
      applications = await this.listApplicationsForOwner(postId, viewerId);
    }

    let myApplication: Record<string, unknown> | null = null;
    if (viewerId && viewerId !== post.poster_id) {
      const app = await db('recruitment_applications')
        .where({ post_id: postId, applicant_user_id: viewerId })
        .first();
      if (app) myApplication = app as Record<string, unknown>;
    }

    return {
      ...post,
      status_view: postStatusView(post),
      poster_nickname: row['poster_nickname'] ?? '匿名玩家',
      ruleset_name: row['ruleset_name'] ?? post.ruleset_id,
      comments,
      applications,
      my_application: myApplication,
    };
  }

  async createApplication(params: {
    post_id: string;
    applicant_user_id: string;
    character_id?: string | null;
    message: string;
  }): Promise<Record<string, unknown>> {
    const post = await this.findById(params.post_id);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id === params.applicant_user_id) throw new Error('不能申请自己的招募帖');
    if (post.status === 'closed') throw new Error('招募帖已关闭');

    if (params.character_id) {
      const character = await db('character_sheets')
        .where({ id: params.character_id, user_id: params.applicant_user_id })
        .first();
      if (!character) throw new Error('角色卡不存在或无权限');
    }

    const existed = await db('recruitment_applications')
      .where({ post_id: params.post_id, applicant_user_id: params.applicant_user_id })
      .first();
    if (existed) throw new Error('你已提交过申请');

    const id = generateId();
    await db('recruitment_applications').insert({
      id,
      post_id: params.post_id,
      applicant_user_id: params.applicant_user_id,
      character_id: params.character_id ?? null,
      message: params.message,
      status: 'pending',
    });

    return (await db('recruitment_applications').where({ id }).first()) as Record<string, unknown>;
  }

  async listApplicationsForOwner(postId: string, ownerId: string): Promise<Array<Record<string, unknown>>> {
    const post = await this.findById(postId);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== ownerId) throw new Error('无权限');

    return db('recruitment_applications as a')
      .leftJoin('users as u', 'a.applicant_user_id', 'u.id')
      .leftJoin('character_sheets as cs', 'a.character_id', 'cs.id')
      .where('a.post_id', postId)
      .select(
        'a.id',
        'a.post_id',
        'a.applicant_user_id',
        'a.character_id',
        'a.message',
        'a.status',
        'a.created_at',
        'a.updated_at',
        'u.nickname as applicant_nickname',
        'cs.name as character_name',
        'cs.ruleset_id as character_ruleset_id',
        'cs.background as character_background',
      )
      .orderBy('a.created_at', 'desc');
  }

  async reviewApplication(params: {
    post_id: string;
    application_id: string;
    owner_id: string;
    action: 'approve' | 'reject';
  }): Promise<Record<string, unknown>> {
    const post = await this.findById(params.post_id);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== params.owner_id) throw new Error('无权限');

    const application = await db('recruitment_applications')
      .where({ id: params.application_id, post_id: params.post_id })
      .first();
    if (!application) throw new Error('申请不存在');

    const status = params.action === 'approve' ? 'approved' : 'rejected';
    await db('recruitment_applications')
      .where({ id: params.application_id })
      .update({ status, updated_at: db.fn.now() });

    await this.recalculatePostCounters(params.post_id);

    return (await db('recruitment_applications').where({ id: params.application_id }).first()) as Record<string, unknown>;
  }

  async createComment(params: { post_id: string; user_id: string; content: string }): Promise<Record<string, unknown>> {
    const post = await this.findById(params.post_id);
    if (!post) throw new Error('招募帖不存在');

    const id = generateId();
    await db('recruitment_comments').insert({
      id,
      post_id: params.post_id,
      user_id: params.user_id,
      content: params.content,
    });

    return (await db('recruitment_comments').where({ id }).first()) as Record<string, unknown>;
  }

  async formGroup(params: {
    post_id: string;
    owner_id: string;
    selected_application_ids: string[];
    module_name?: string | null;
  }): Promise<Record<string, unknown>> {
    const post = await this.findById(params.post_id);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== params.owner_id) throw new Error('无权限');
    if (post.campaign_id) throw new Error('该招募帖已成团');

    const selectedApps = await db('recruitment_applications')
      .whereIn('id', params.selected_application_ids)
      .andWhere({ post_id: params.post_id });

    if (selectedApps.length === 0) throw new Error('请至少选择一名申请者');
    if (selectedApps.length > post.player_count_max) throw new Error('选择人数超过需求人数');

    for (const app of selectedApps) {
      if (!app.character_id) throw new Error('存在未绑定角色卡的申请，无法成团');
      const sheet = await db('character_sheets')
        .where({ id: app.character_id, user_id: app.applicant_user_id })
        .first();
      if (!sheet) throw new Error('申请角色卡无效');
    }

    const campaign = await campaignService.create({
      name: post.title,
      ruleset_id: post.ruleset_id,
      gm_user_id: params.owner_id,
    });

    const scenes = await campaignService.listScenes(campaign.id);
    const lobby = scenes.find((scene) => scene.type === 'lobby') ?? scenes[0];
    if (!lobby) throw new Error('默认场景创建失败');

    for (const app of selectedApps) {
      const stateId = generateId();
      const participationId = generateId();

      await db('character_scene_states').insert({
        id: stateId,
        character_id: app.character_id,
        campaign_id: campaign.id,
        current_spatial_scene_id: lobby.id,
        personal_story_time: JSON.stringify({ day: 1, hour: 8, minute: 0 }),
      });

      await db('scene_participations').insert({
        id: participationId,
        scene_id: lobby.id,
        character_id: app.character_id,
      });
    }

    await db('recruitment_applications')
      .where({ post_id: params.post_id })
      .whereIn('id', params.selected_application_ids)
      .update({ status: 'approved', updated_at: db.fn.now() });

    await db('recruitment_applications')
      .where({ post_id: params.post_id })
      .whereNotIn('id', params.selected_application_ids)
      .update({ status: 'rejected', updated_at: db.fn.now() });

    await db('recruitment_posts')
      .where({ id: params.post_id })
      .update({
        status: 'closed',
        campaign_id: campaign.id,
        module_name: params.module_name ?? post.module_name ?? null,
        player_count_joined: selectedApps.length,
      });

    const notifications = selectedApps.map((app) => ({
      id: generateId(),
      user_id: app.applicant_user_id,
      type: 'campaign_grouped',
      title: '你加入的招募帖已成团',
      content: `《${post.title}》已成团，快去我的团查看吧。`,
      metadata: JSON.stringify({ campaign_id: campaign.id, post_id: post.id }),
    }));
    await db('user_notifications').insert(notifications);

    return { campaign_id: campaign.id, selected_count: selectedApps.length };
  }

  async update(id: string, updates: Partial<Pick<RecruitmentPost, 'title' | 'status'>>): Promise<RecruitmentPost> {
    await db('recruitment_posts').where({ id }).update(updates);
    return this.findById(id) as Promise<RecruitmentPost>;
  }

  private async recalculatePostCounters(postId: string): Promise<void> {
    const approvedCountRow = await db('recruitment_applications')
      .where({ post_id: postId, status: 'approved' })
      .count<{ total: number }[]>({ total: '*' })
      .first();
    const approvedCount = Number(approvedCountRow?.total ?? 0);

    const post = await this.findById(postId);
    if (!post) return;

    let nextStatus: RecruitmentPost['status'] = post.status;
    if (post.status !== 'closed') {
      nextStatus = approvedCount >= post.player_count_max ? 'full' : 'open';
    }

    await db('recruitment_posts').where({ id: postId }).update({
      player_count_joined: approvedCount,
      status: nextStatus,
    });
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
  async findById(_id: string): Promise<null> {
    return null;
  }
}

export const recruitmentService = new RecruitmentService();
export const rulesetService = new RulesetService();
export const moduleService = new ModuleService();
