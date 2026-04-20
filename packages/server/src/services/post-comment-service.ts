import { randomUUID } from 'crypto';
import { db } from '../db';

export interface FloorReply {
  id: string;
  post_id: string;
  user_id: string;
  floor_number: number;
  content: string;
  like_count: number;
  reply_count: number;
  deleted: boolean;
  created_at: Date;
  author_nickname?: string;
  author_avatar?: string;
  is_liked_by_me?: boolean;
  preview_comments?: FloorComment[];
}

export interface FloorComment {
  id: string;
  reply_id: string;
  user_id: string;
  parent_comment_id: string | null;
  content: string;
  like_count: number;
  deleted: boolean;
  created_at: Date;
  author_nickname?: string;
  author_avatar?: string;
  is_liked_by_me?: boolean;
  parent_author_nickname?: string;
}

export interface FloorsPageResponse {
  floors: FloorReply[];
  total: number;
  page: number;
  pageSize: number;
}

class PostCommentService {
  /**
   * 分页获取主楼层列表，每楼附带最近 3 条楼中楼预览
   */
  async getFloorsWithComments(
    postId: string,
    page: number,
    pageSize: number,
    requestUserId?: string,
  ): Promise<FloorsPageResponse> {
    const limit = Math.min(pageSize, 50);
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db('post_replies as r')
        .leftJoin('users as u', 'r.user_id', 'u.id')
        .where('r.post_id', postId)
        .orderBy('r.floor_number', 'asc')
        .limit(limit)
        .offset(offset)
        .select(
          'r.id', 'r.post_id', 'r.user_id', 'r.floor_number',
          'r.content', 'r.like_count', 'r.reply_count', 'r.deleted',
          'r.created_at', 'u.nickname as author_nickname', 'u.avatar_url as author_avatar',
        ),
      db('post_replies').where({ post_id: postId }).count('id as count').first(),
    ]);

    const total = Number((countResult as Record<string, unknown>)?.['count'] ?? 0);
    const floorIds = (rows as Record<string, unknown>[]).map((r) => r['id'] as string);

    // 查询每楼最近 3 条楼中楼（预览）
    const previewMap = new Map<string, FloorComment[]>();
    if (floorIds.length > 0) {
      const previewRows = await db('reply_comments as c')
        .leftJoin('users as u', 'c.user_id', 'u.id')
        .leftJoin('users as pu', 'c.parent_comment_id', 'pu.id')
        .whereIn('c.reply_id', floorIds)
        .orderBy('c.reply_id').orderBy('c.created_at', 'asc')
        .select(
          'c.id', 'c.reply_id', 'c.user_id', 'c.parent_comment_id',
          'c.content', 'c.like_count', 'c.deleted', 'c.created_at',
          'u.nickname as author_nickname', 'u.avatar_url as author_avatar',
          'pu.nickname as parent_author_nickname',
        );

      // 按 reply_id 分组，每组最多取 3 条
      for (const row of previewRows as Record<string, unknown>[]) {
        const replyId = row['reply_id'] as string;
        const list = previewMap.get(replyId) ?? [];
        if (list.length < 3) {
          list.push(mapComment(row));
          previewMap.set(replyId, list);
        }
      }
    }

    // 查询当前用户的点赞状态
    const likedFloorIds = new Set<string>();
    if (requestUserId && floorIds.length > 0) {
      const liked = await db('floor_likes')
        .whereIn('reply_id', floorIds)
        .where('user_id', requestUserId)
        .select('reply_id');
      for (const row of liked as Record<string, unknown>[]) {
        likedFloorIds.add(row['reply_id'] as string);
      }
    }

    const floors: FloorReply[] = (rows as Record<string, unknown>[]).map((r) => ({
      id: r['id'] as string,
      post_id: r['post_id'] as string,
      user_id: r['user_id'] as string,
      floor_number: Number(r['floor_number']),
      content: r['deleted'] ? '[该楼层已删除]' : (r['content'] as string),
      like_count: Number(r['like_count']),
      reply_count: Number(r['reply_count']),
      deleted: Boolean(r['deleted']),
      created_at: r['created_at'] as Date,
      author_nickname: r['author_nickname'] as string | undefined,
      author_avatar: r['author_avatar'] as string | undefined,
      is_liked_by_me: likedFloorIds.has(r['id'] as string),
      preview_comments: previewMap.get(r['id'] as string) ?? [],
    }));

    return { floors, total, page, pageSize: limit };
  }

  /**
   * 获取指定楼层的全部楼中楼（分页）
   */
  async getFloorComments(
    replyId: string,
    page: number,
    pageSize: number,
    requestUserId?: string,
  ): Promise<{ comments: FloorComment[]; total: number }> {
    const limit = Math.min(pageSize, 100);
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db('reply_comments as c')
        .leftJoin('users as u', 'c.user_id', 'u.id')
        .leftJoin('users as pu', 'c.parent_comment_id', 'pu.id')
        .where('c.reply_id', replyId)
        .orderBy('c.created_at', 'asc')
        .limit(limit)
        .offset(offset)
        .select(
          'c.id', 'c.reply_id', 'c.user_id', 'c.parent_comment_id',
          'c.content', 'c.like_count', 'c.deleted', 'c.created_at',
          'u.nickname as author_nickname', 'u.avatar_url as author_avatar',
          'pu.nickname as parent_author_nickname',
        ),
      db('reply_comments').where({ reply_id: replyId }).count('id as count').first(),
    ]);

    const total = Number((countResult as Record<string, unknown>)?.['count'] ?? 0);

    // 查询点赞状态
    const commentIds = (rows as Record<string, unknown>[]).map((r) => r['id'] as string);
    const likedIds = new Set<string>();
    if (requestUserId && commentIds.length > 0) {
      const liked = await db('comment_likes')
        .whereIn('comment_id', commentIds)
        .where('user_id', requestUserId)
        .select('comment_id');
      for (const row of liked as Record<string, unknown>[]) {
        likedIds.add(row['comment_id'] as string);
      }
    }

    const comments: FloorComment[] = (rows as Record<string, unknown>[]).map((r) => ({
      ...mapComment(r),
      is_liked_by_me: likedIds.has(r['id'] as string),
    }));

    return { comments, total };
  }

  /**
   * 新增主楼层
   */
  async createFloor(postId: string, userId: string, content: string): Promise<FloorReply> {
    const id = randomUUID();
    const now = new Date();

    // 计算下一楼层号（至少为 2，1 楼预留给帖子正文）
    const maxResult = await db('post_replies')
      .where({ post_id: postId })
      .max('floor_number as max')
      .first();
    const maxFloor = Number((maxResult as Record<string, unknown>)?.['max'] ?? 1);
    const floorNumber = Math.max(maxFloor + 1, 2);

    await db('post_replies').insert({
      id,
      post_id: postId,
      user_id: userId,
      floor_number: floorNumber,
      content,
      like_count: 0,
      reply_count: 0,
      is_original_post: false,
      deleted: false,
      created_at: now,
      updated_at: now,
    });

    const user = await db('users').where({ id: userId }).select('nickname', 'avatar_url').first();

    return {
      id,
      post_id: postId,
      user_id: userId,
      floor_number: floorNumber,
      content,
      like_count: 0,
      reply_count: 0,
      deleted: false,
      created_at: now,
      author_nickname: (user as Record<string, unknown> | undefined)?.['nickname'] as string | undefined,
      author_avatar: (user as Record<string, unknown> | undefined)?.['avatar_url'] as string | undefined,
      is_liked_by_me: false,
      preview_comments: [],
    };
  }

  /**
   * 软删除主楼层（保留楼层号）
   */
  async deleteFloor(floorId: string, requestUserId: string, isGm = false): Promise<void> {
    const row = await db('post_replies').where({ id: floorId }).first();
    if (!row) throw new Error('楼层不存在');
    if (!isGm && (row as Record<string, unknown>)['user_id'] !== requestUserId) {
      throw new Error('无权删除');
    }
    await db('post_replies').where({ id: floorId }).update({ deleted: true, updated_at: new Date() });
  }

  /**
   * 新增楼中楼（嵌套层数限制为 1）
   */
  async createComment(
    replyId: string,
    userId: string,
    content: string,
    parentCommentId?: string,
  ): Promise<FloorComment> {
    // 校验楼层存在
    const floor = await db('post_replies').where({ id: replyId }).first();
    if (!floor) throw new Error('楼层不存在');
    if ((floor as Record<string, unknown>)['deleted']) throw new Error('该楼层已删除，无法回复');

    // 校验 parentCommentId：必须属于同一楼层（防止跨楼嵌套）
    if (parentCommentId) {
      const parentComment = await db('reply_comments').where({ id: parentCommentId }).first();
      if (!parentComment) throw new Error('被回复的评论不存在');
      if ((parentComment as Record<string, unknown>)['reply_id'] !== replyId) {
        throw new Error('不允许跨楼层回复');
      }
    }

    const id = randomUUID();
    const now = new Date();

    await db.transaction(async (trx) => {
      await trx('reply_comments').insert({
        id,
        reply_id: replyId,
        user_id: userId,
        parent_comment_id: parentCommentId ?? null,
        content,
        like_count: 0,
        deleted: false,
        created_at: now,
        updated_at: now,
      });
      await trx('post_replies')
        .where({ id: replyId })
        .increment('reply_count', 1)
        .update({ updated_at: now });
    });

    const user = await db('users').where({ id: userId }).select('nickname', 'avatar_url').first();
    let parentNickname: string | undefined;
    if (parentCommentId) {
      const parentUser = await db('reply_comments as c')
        .leftJoin('users as u', 'c.user_id', 'u.id')
        .where('c.id', parentCommentId)
        .select('u.nickname as parent_author_nickname')
        .first();
      parentNickname = (parentUser as Record<string, unknown> | undefined)?.['parent_author_nickname'] as string | undefined;
    }

    return {
      id,
      reply_id: replyId,
      user_id: userId,
      parent_comment_id: parentCommentId ?? null,
      content,
      like_count: 0,
      deleted: false,
      created_at: now,
      author_nickname: (user as Record<string, unknown> | undefined)?.['nickname'] as string | undefined,
      author_avatar: (user as Record<string, unknown> | undefined)?.['avatar_url'] as string | undefined,
      is_liked_by_me: false,
      parent_author_nickname: parentNickname,
    };
  }

  /**
   * 删除楼中楼（物理删除，同步 reply_count）
   */
  async deleteComment(commentId: string, requestUserId: string): Promise<void> {
    const row = await db('reply_comments').where({ id: commentId }).first();
    if (!row) throw new Error('评论不存在');
    if ((row as Record<string, unknown>)['user_id'] !== requestUserId) {
      throw new Error('无权删除');
    }
    const replyId = (row as Record<string, unknown>)['reply_id'] as string;
    await db.transaction(async (trx) => {
      await trx('reply_comments').where({ id: commentId }).delete();
      await trx('post_replies')
        .where({ id: replyId })
        .decrement('reply_count', 1)
        .update({ updated_at: new Date() });
    });
  }

  /**
   * 点赞主楼层
   */
  async likeFloor(replyId: string, userId: string): Promise<void> {
    const floor = await db('post_replies').where({ id: replyId }).first();
    if (!floor) throw new Error('楼层不存在');

    const existing = await db('floor_likes').where({ reply_id: replyId, user_id: userId }).first();
    if (existing) return; // 已点赞，幂等处理

    await db.transaction(async (trx) => {
      await trx('floor_likes').insert({
        id: randomUUID(),
        reply_id: replyId,
        user_id: userId,
        created_at: new Date(),
      });
      await trx('post_replies').where({ id: replyId }).increment('like_count', 1);
    });
  }

  /**
   * 取消点赞主楼层
   */
  async unlikeFloor(replyId: string, userId: string): Promise<void> {
    const existing = await db('floor_likes').where({ reply_id: replyId, user_id: userId }).first();
    if (!existing) return; // 未点赞，幂等处理

    await db.transaction(async (trx) => {
      await trx('floor_likes').where({ reply_id: replyId, user_id: userId }).delete();
      await trx('post_replies').where({ id: replyId }).decrement('like_count', 1);
    });
  }

  /**
   * 点赞楼中楼
   */
  async likeComment(commentId: string, userId: string): Promise<void> {
    const comment = await db('reply_comments').where({ id: commentId }).first();
    if (!comment) throw new Error('评论不存在');

    const existing = await db('comment_likes').where({ comment_id: commentId, user_id: userId }).first();
    if (existing) return;

    await db.transaction(async (trx) => {
      await trx('comment_likes').insert({
        id: randomUUID(),
        comment_id: commentId,
        user_id: userId,
        created_at: new Date(),
      });
      await trx('reply_comments').where({ id: commentId }).increment('like_count', 1);
    });
  }

  /**
   * 取消点赞楼中楼
   */
  async unlikeComment(commentId: string, userId: string): Promise<void> {
    const existing = await db('comment_likes').where({ comment_id: commentId, user_id: userId }).first();
    if (!existing) return;

    await db.transaction(async (trx) => {
      await trx('comment_likes').where({ comment_id: commentId, user_id: userId }).delete();
      await trx('reply_comments').where({ id: commentId }).decrement('like_count', 1);
    });
  }
}

function mapComment(r: Record<string, unknown>): FloorComment {
  return {
    id: r['id'] as string,
    reply_id: r['reply_id'] as string,
    user_id: r['user_id'] as string,
    parent_comment_id: (r['parent_comment_id'] as string | null) ?? null,
    content: r['deleted'] ? '[该评论已删除]' : (r['content'] as string),
    like_count: Number(r['like_count']),
    deleted: Boolean(r['deleted']),
    created_at: r['created_at'] as Date,
    author_nickname: r['author_nickname'] as string | undefined,
    author_avatar: r['author_avatar'] as string | undefined,
    parent_author_nickname: r['parent_author_nickname'] as string | undefined,
  };
}

export const postCommentService = new PostCommentService();
