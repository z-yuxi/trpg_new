import { db } from '../db';
import { generateId } from '@trpg/shared';
import type {
  RecruitmentPost,
  RecruitmentApplication,
} from '@trpg/shared';
import { campaignService } from './campaign-service';
import {
  INVITE_EXPIRY_HOURS,
  parseJsonArray,
  parseJsonObject,
  rowToPost,
  rowToApplication,
  nextWaitingPosition,
  recalculatePostCounters,
  promoteNextWaiting,
} from './recruitment-domain';

/** 招募帖板块展示视图中额外区分 grouped（已成团）的联合类型 */
type BoardStatusFilter = import('@trpg/shared').RecruitmentStatus | 'grouped';

// ─────────────────────────────────────────────
// Service class
// ─────────────────────────────────────────────

export class RecruitmentService {
  // ── 招募帖 CRUD ──────────────────────────────

  async create(params: {
    poster_id: string;
    type: RecruitmentPost['type'];
    title: string;
    ruleset_id: string;
    module_name?: string | null;
    player_count_max: number;
    schedule_text?: string | null;
    schedule_weekday?: string[] | null;
    schedule_time_slot?: string | null;
    description?: string | null;
    tags?: string[];
    metadata?: Record<string, unknown> | null;
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
      schedule_weekday: params.schedule_weekday ? JSON.stringify(params.schedule_weekday) : null,
      schedule_time_slot: params.schedule_time_slot ?? null,
      description: params.description ?? null,
      tags: JSON.stringify(params.tags ?? []),
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      status: 'draft',
    });
    return this.findById(id) as Promise<RecruitmentPost>;
  }

  /** 将草稿发布为公开招募（draft → open） */
  async publish(postId: string, ownerId: string): Promise<RecruitmentPost> {
    const post = await this.findById(postId);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== ownerId) throw new Error('无权限');
    if (post.status !== 'draft') throw new Error(`当前状态 ${post.status} 不可发布`);

    await db('recruitment_posts').where({ id: postId }).update({ status: 'open' });
    return this.findById(postId) as Promise<RecruitmentPost>;
  }

  /** 手动关闭招募（open/full → closed） */
  async close(postId: string, ownerId: string): Promise<RecruitmentPost> {
    const post = await this.findById(postId);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== ownerId) throw new Error('无权限');
    if (!['open', 'full'].includes(post.status)) throw new Error(`当前状态 ${post.status} 不可关闭`);

    await db('recruitment_posts').where({ id: postId }).update({ status: 'closed' });
    return this.findById(postId) as Promise<RecruitmentPost>;
  }

  /** 解散团（grouped → dissolved） */
  async dissolve(postId: string, ownerId: string): Promise<RecruitmentPost> {
    const post = await this.findById(postId);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== ownerId) throw new Error('无权限');
    if (post.status !== 'grouped') throw new Error('仅已成团的招募帖可解散');

    await db('recruitment_posts').where({ id: postId }).update({ status: 'dissolved' });
    return this.findById(postId) as Promise<RecruitmentPost>;
  }

  async findById(id: string): Promise<RecruitmentPost | null> {
    const row = await db('recruitment_posts').where({ id }).first();
    if (!row) return null;
    return rowToPost(row as Record<string, unknown>);
  }

  async update(
    id: string,
    updates: Partial<
      Pick<
        RecruitmentPost,
        | 'title'
        | 'description'
        | 'schedule_text'
        | 'module_name'
        | 'player_count_max'
        | 'tags'
        | 'metadata'
      >
    >,
  ): Promise<RecruitmentPost> {
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload['title'] = updates.title;
    if (updates.description !== undefined) payload['description'] = updates.description;
    if (updates.schedule_text !== undefined) payload['schedule_text'] = updates.schedule_text;
    if (updates.module_name !== undefined) payload['module_name'] = updates.module_name;
    if (updates.player_count_max !== undefined) payload['player_count_max'] = updates.player_count_max;
    if (updates.tags !== undefined) payload['tags'] = JSON.stringify(updates.tags ?? []);
    if (updates.metadata !== undefined)
      payload['metadata'] = updates.metadata ? JSON.stringify(updates.metadata) : null;

    await db('recruitment_posts').where({ id }).update(payload);
    return this.findById(id) as Promise<RecruitmentPost>;
  }

  async list(params: {
    status?: BoardStatusFilter;
    type?: RecruitmentPost['type'];
    ruleset_id?: string;
    keyword?: string;
    tag?: string;
    sort?: 'latest' | 'oldest' | 'hottest';
    poster_id?: string;
    /** 仅过滤该用户的申请（my=applied 模式） */
    applicant_user_id?: string;
    /** 已登录用户 ID：仅用于查询每帖的申请状态，不过滤结果 */
    viewer_id?: string;
    /** 结构化时间筛选：星期（如 'sat'） */
    schedule_weekday?: string;
    /** 结构化时间筛选：时间段 */
    schedule_time_slot?: string;
    /** 最少剩余席位（1 = 至少1席，2 = 至少2席） */
    min_seats_available?: number;
    page?: number;
    limit?: number;
  }): Promise<{ data: Array<Record<string, unknown>>; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(50, Math.max(1, params.limit ?? 10));

    // 决定用哪个 userId 查申请状态
    const lookupUserId = params.applicant_user_id ?? params.viewer_id;

    let query = db('recruitment_posts as rp')
      .leftJoin('users as u', 'rp.poster_id', 'u.id')
      .leftJoin('rulesets as r', 'rp.ruleset_id', 'r.id')
      // 成团后关联 campaign 以获取 allow_ob 字段
      .leftJoin('campaigns as c', 'rp.campaign_id', 'c.id');

    if (lookupUserId) {
      query = query.leftJoin('recruitment_applications as ra', function joinApplications() {
        this.on('ra.post_id', '=', 'rp.id').andOn(
          'ra.applicant_user_id',
          '=',
          db.raw('?', [lookupUserId]),
        );
      });
    }

    if (params.type) query = query.where('rp.type', params.type);
    if (params.ruleset_id) query = query.where('rp.ruleset_id', params.ruleset_id);
    if (params.poster_id) query = query.where('rp.poster_id', params.poster_id);
    if (params.keyword) {
      query = query.where((builder) => {
        const kw = `%${(params.keyword ?? '').replace(/[%_\\]/g, '\\$&')}%`;
        builder.where('rp.title', 'like', kw).orWhere('rp.description', 'like', kw);
      });
    }
    if (params.tag)
      query = query.where('rp.tags', 'like', `%${params.tag.replace(/[%_\\]/g, '\\$&')}%`);

    // 仅 applicant_user_id 模式才过滤（viewer_id 只查状态不过滤）
    if (params.applicant_user_id) query = query.whereNotNull('ra.id');

    if (params.status) {
      query = query.where('rp.status', params.status);
    } else {
      // 默认不展示草稿
      query = query.whereNot('rp.status', 'draft');
    }

    // 结构化时间段筛选
    if (params.schedule_weekday) {
      const wd = params.schedule_weekday.replace(/[%_\\]/g, '\\$&');
      query = query.whereRaw(`JSON_CONTAINS(rp.schedule_weekday, JSON_ARRAY(?))`, [wd]);
    }
    if (params.schedule_time_slot) {
      query = query.where('rp.schedule_time_slot', params.schedule_time_slot);
    }

    // 剩余席位筛选：(player_count_max - player_count_joined) >= N
    if (params.min_seats_available && params.min_seats_available > 0) {
      query = query.whereRaw(
        '(rp.player_count_max - rp.player_count_joined) >= ?',
        [params.min_seats_available],
      );
    }

    const countRow = await query.clone().count<{ total: number }[]>({ total: '*' }).first();
    const total = Number(countRow?.total ?? 0);

    const rows = await query
      .select(
        'rp.*',
        'u.nickname as poster_nickname',
        'r.name as ruleset_name',
        'c.allow_ob as campaign_allow_ob',
        lookupUserId
          ? 'ra.status as my_application_status'
          : db.raw('null as my_application_status'),
        lookupUserId
          ? 'ra.id as my_application_id'
          : db.raw('null as my_application_id'),
        lookupUserId
          ? 'ra.invited_expires_at as my_application_expires_at'
          : db.raw('null as my_application_expires_at'),
      )
      .orderBy(
        params.sort === 'hottest' ? 'rp.player_count_joined' : 'rp.created_at',
        params.sort === 'oldest' ? 'asc' : 'desc',
      )
      .orderBy('rp.created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit);

    const data = rows.map((row: Record<string, unknown>) => ({
      ...rowToPost(row),
      poster_nickname: row['poster_nickname'] ?? '匿名玩家',
      ruleset_name: row['ruleset_name'] ?? (row['ruleset_id'] as string),
      my_application_status: row['my_application_status'] ?? null,
      my_application_id: row['my_application_id'] ?? null,
      my_application_expires_at: row['my_application_expires_at'] ?? null,
    }));

    return { data, total, page, limit };
  }

  async getDetail(postId: string, viewerId?: string): Promise<Record<string, unknown> | null> {
    const row = await db('recruitment_posts as rp')
      .leftJoin('users as u', 'rp.poster_id', 'u.id')
      .leftJoin('rulesets as r', 'rp.ruleset_id', 'r.id')
      .leftJoin('campaigns as c', 'rp.campaign_id', 'c.id')
      .where('rp.id', postId)
      .select('rp.*', 'u.nickname as poster_nickname', 'r.name as ruleset_name', 'c.allow_ob as campaign_allow_ob')
      .first() as Record<string, unknown> | null;

    if (!row) return null;

    const post = rowToPost(row);

    const comments = await db('recruitment_comments as c')
      .leftJoin('users as u', 'c.user_id', 'u.id')
      .where('c.post_id', postId)
      .select('c.id', 'c.post_id', 'c.user_id', 'c.content', 'c.created_at', 'u.nickname as user_nickname')
      .orderBy('c.created_at', 'asc');

    let applications: RecruitmentApplication[] = [];
    if (viewerId && viewerId === post.poster_id) {
      applications = await this.listApplicationsForOwner(postId, viewerId);
    }

    let myApplication: RecruitmentApplication | null = null;
    if (viewerId && viewerId !== post.poster_id) {
      const app = await db('recruitment_applications')
        .where({ post_id: postId, applicant_user_id: viewerId })
        .first() as Record<string, unknown> | null;
      if (app) myApplication = rowToApplication(app);
    }

    return {
      ...post,
      poster_nickname: row['poster_nickname'] ?? '匿名玩家',
      ruleset_name: row['ruleset_name'] ?? post.ruleset_id,
      comments,
      applications,
      my_application: myApplication,
    };
  }

  // ── 申请流程 ──────────────────────────────────

  /**
   * 申请加入（创建 pending 申请）。
   * @param apply_type 'normal'=普通申请（default），'waiting'=加入候补队列
   */
  async createApplication(params: {
    post_id: string;
    applicant_user_id: string;
    character_id?: string | null;
    message: string;
    apply_type?: 'normal' | 'waiting';
  }): Promise<RecruitmentApplication> {
    const post = await this.findById(params.post_id);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id === params.applicant_user_id) throw new Error('不能申请自己的招募帖');
    if (!['open', 'full'].includes(post.status)) throw new Error('该招募帖当前不接受申请');

    if (params.character_id) {
      const character = await db('character_sheets')
        .where({ id: params.character_id, user_id: params.applicant_user_id })
        .first() as Record<string, unknown> | null;
      if (!character) throw new Error('角色卡不存在或无权限');
      if (character['ruleset_id'] !== post.ruleset_id) throw new Error('角色卡规则包与招募帖不匹配');
    }

    // MEDIUM-fix: 将重复检查+插入放入事务，防止并发竞态导致重复申请
    const id = generateId();
    await db.transaction(async (trx) => {
      // forUpdate 行锁：并发申请时只有一个能获得锁并继续
      const existed = await trx('recruitment_applications')
        .where({ post_id: params.post_id, applicant_user_id: params.applicant_user_id })
        .forUpdate()
        .first();
      if (existed) throw new Error('你已提交过申请');

      const isWaiting = params.apply_type === 'waiting' || post.status === 'full';

      if (isWaiting) {
        const pos = await nextWaitingPosition(params.post_id);
        await trx('recruitment_applications').insert({
          id,
          post_id: params.post_id,
          applicant_user_id: params.applicant_user_id,
          character_id: params.character_id ?? null,
          message: params.message,
          status: 'waiting',
          waiting_position: pos,
        });
      } else {
        await trx('recruitment_applications').insert({
          id,
          post_id: params.post_id,
          applicant_user_id: params.applicant_user_id,
          character_id: params.character_id ?? null,
          message: params.message,
          status: 'pending',
        });
      }
    });

    return rowToApplication(
      (await db('recruitment_applications').where({ id }).first()) as Record<string, unknown>,
    );
  }

  async listApplicationsForOwner(
    postId: string,
    ownerId: string,
  ): Promise<RecruitmentApplication[]> {
    const post = await this.findById(postId);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== ownerId) throw new Error('无权限');

    const rows = await db('recruitment_applications as a')
      .leftJoin('users as u', 'a.applicant_user_id', 'u.id')
      .leftJoin('character_sheets as cs', 'a.character_id', 'cs.id')
      .where('a.post_id', postId)
      .select(
        'a.*',
        'u.nickname as applicant_nickname',
        'cs.name as character_name',
        'cs.ruleset_id as character_ruleset_id',
        'cs.background as character_background',
      )
      .orderBy('a.created_at', 'desc');

    return rows.map((row: Record<string, unknown>) => rowToApplication(row));
  }

  /**
   * GM 审批申请（pending → invited / rejected）。
   * approve → invited，写入24h确认截止时间。
   * reject  → rejected，可选拒绝原因；若有候补则自动提升。
   */
  async reviewApplication(params: {
    post_id: string;
    application_id: string;
    owner_id: string;
    action: 'approve' | 'reject';
    reject_reason?: string | null;
  }): Promise<RecruitmentApplication> {
    const post = await this.findById(params.post_id);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== params.owner_id) throw new Error('无权限');

    const application = await db('recruitment_applications')
      .where({ id: params.application_id, post_id: params.post_id })
      .first() as Record<string, unknown> | null;
    if (!application) throw new Error('申请不存在');
    if (application['status'] !== 'pending') throw new Error('只能审批 pending 状态的申请');

    if (params.action === 'approve') {
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
      await db('recruitment_applications').where({ id: params.application_id }).update({
        status: 'invited',
        invited_expires_at: expiresAt,
        updated_at: db.fn.now(),
      });
    } else {
      await db('recruitment_applications').where({ id: params.application_id }).update({
        status: 'rejected',
        reject_reason: params.reject_reason ?? null,
        updated_at: db.fn.now(),
      });
      await promoteNextWaiting(params.post_id);
    }

    return rowToApplication(
      (await db('recruitment_applications')
        .where({ id: params.application_id })
        .first()) as Record<string, unknown>,
    );
  }

  /**
   * 玩家确认入团（invited → confirmed）。
   * 确认后重新计算席位计数，帖状态可能变 full。
   */
  async confirmApplication(params: {
    application_id: string;
    applicant_user_id: string;
  }): Promise<RecruitmentApplication> {
    const application = await db('recruitment_applications')
      .where({ id: params.application_id, applicant_user_id: params.applicant_user_id })
      .first() as Record<string, unknown> | null;
    if (!application) throw new Error('申请不存在');
    if (application['status'] !== 'invited') throw new Error('只能确认 invited 状态的申请');

    if (application['invited_expires_at']) {
      const expiresAt = new Date(application['invited_expires_at'] as string | number);
      if (expiresAt < new Date()) {
        await db('recruitment_applications').where({ id: params.application_id }).update({
          status: 'rejected',
          reject_reason: '邀请确认超时（24h）',
          updated_at: db.fn.now(),
        });
        await promoteNextWaiting(application['post_id'] as string);
        throw new Error('邀请已过期，请重新申请');
      }
    }

    await db('recruitment_applications').where({ id: params.application_id }).update({
      status: 'confirmed',
      invited_expires_at: null,
      updated_at: db.fn.now(),
    });

    await recalculatePostCounters(application['post_id'] as string);

    return rowToApplication(
      (await db('recruitment_applications')
        .where({ id: params.application_id })
        .first()) as Record<string, unknown>,
    );
  }

  /**
   * 批量处理过期邀请（由定时任务调用）。
   * 将超时未确认的 invited 申请改为 rejected，并提升候补。
   */
  async expireInvites(): Promise<number> {
    const expired = await db('recruitment_applications')
      .where('status', 'invited')
      .where('invited_expires_at', '<', new Date())
      .select('id', 'post_id') as Array<{ id: string; post_id: string }>;

    if (expired.length === 0) return 0;

    await db('recruitment_applications')
      .whereIn('id', expired.map((r) => r.id))
      .update({
        status: 'rejected',
        reject_reason: '邀请确认超时（24h）',
        updated_at: db.fn.now(),
      });

    const postIds = [...new Set(expired.map((r) => r.post_id))];
    for (const postId of postIds) {
      await promoteNextWaiting(postId);
    }

    return expired.length;
  }

  // ── 成团 ──────────────────────────────────────

  /**
   * GM 发起成团（open/full → grouped）。
   * 将所有 confirmed 申请者加入团；未处理的 pending/invited/waiting 一律 rejected。
   */
  async formGroup(params: {
    post_id: string;
    owner_id: string;
    module_name?: string | null;
  }): Promise<{ campaign_id: string; member_count: number }> {
    const post = await this.findById(params.post_id);
    if (!post) throw new Error('招募帖不存在');
    if (post.poster_id !== params.owner_id) throw new Error('无权限');
    if (!['open', 'full'].includes(post.status)) throw new Error('只有招募中的帖子可以成团');
    if (post.campaign_id) throw new Error('该招募帖已成团');

    const confirmedApps = await db('recruitment_applications')
      .where({ post_id: params.post_id, status: 'confirmed' })
      .select('*') as Array<Record<string, unknown>>;

    if (confirmedApps.length === 0) throw new Error('没有已确认入团的玩家，无法成团');

    for (const app of confirmedApps) {
      if (!app['character_id']) throw new Error('存在未绑定角色卡的确认玩家，无法成团');
      const sheet = await db('character_sheets')
        .where({ id: app['character_id'], user_id: app['applicant_user_id'] })
        .first();
      if (!sheet) throw new Error('确认玩家的角色卡无效');
    }

    // 简化开团：module_id 在招募帖上不存储，走 formGroup 时传 null（来自规则包入口）
    const campaign = await campaignService.create({
      name: post.title,
      ruleset_id: post.ruleset_id,
      gm_user_id: params.owner_id,
    });

    const scenes = await campaignService.listScenes(campaign.id);
    const lobby = scenes.find((scene) => scene.type === 'lobby') ?? scenes[0];
    if (!lobby) throw new Error('默认场景创建失败');

    for (const app of confirmedApps) {
      const stateId = generateId();
      const participationId = generateId();

      await db('character_scene_states').insert({
        id: stateId,
        character_id: app['character_id'],
        campaign_id: campaign.id,
        current_spatial_scene_id: lobby.id,
        personal_story_time: JSON.stringify({ day: 1, hour: 8, minute: 0 }),
      });

      await db('scene_participations').insert({
        id: participationId,
        scene_id: lobby.id,
        character_id: app['character_id'],
      });
    }

    await db('recruitment_applications')
      .where({ post_id: params.post_id })
      .whereIn('status', ['pending', 'invited', 'waiting'])
      .update({ status: 'rejected', reject_reason: '招募帖已成团', updated_at: db.fn.now() });

    await db('recruitment_posts').where({ id: params.post_id }).update({
      status: 'grouped',
      campaign_id: campaign.id,
      module_name: params.module_name ?? post.module_name ?? null,
      player_count_joined: confirmedApps.length,
    });

    return { campaign_id: campaign.id, member_count: confirmedApps.length };
  }

  // ── 评论 ──────────────────────────────────────

  async createComment(params: {
    post_id: string;
    user_id: string;
    content: string;
  }): Promise<Record<string, unknown>> {
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
}

export const recruitmentService = new RecruitmentService();
