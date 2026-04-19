import { randomUUID } from 'crypto';
import { db } from '../db';

export type ForumBoard = 'rules' | 'creation' | 'experience' | 'newbie' | 'lounge';
export type ThreadSort = 'newest' | 'hottest' | 'latest_reply';

export interface ForumThread {
  id: string;
  board: ForumBoard;
  author_id: string;
  author_nickname?: string;
  title: string;
  content: string;
  view_count: number;
  reply_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  last_reply_at: Date | null;
  created_at: Date;
}

export interface ForumPost {
  id: string;
  thread_id: string;
  author_id: string;
  author_nickname?: string;
  content: string;
  floor_number: number;
  reply_to_post_id: string | null;
  created_at: Date;
}

class ForumService {
  async listThreads(params: {
    board: ForumBoard;
    sort?: ThreadSort;
    page?: number;
    limit?: number;
  }): Promise<{ data: ForumThread[]; total: number }> {
    const { board, sort = 'latest_reply', page = 1, limit = 20 } = params;
    const offset = (page - 1) * Math.min(limit, 50);

    const base = () =>
      db('forum_threads as t')
        .leftJoin('users as u', 't.author_id', 'u.id')
        .where('t.board', board)
        .select(
          't.id', 't.board', 't.author_id', 'u.nickname as author_nickname',
          't.title', 't.view_count', 't.reply_count',
          't.is_pinned', 't.is_locked', 't.last_reply_at', 't.created_at',
        );

    let q = base();
    if (sort === 'newest') q = q.orderBy('t.is_pinned', 'desc').orderBy('t.created_at', 'desc');
    else if (sort === 'hottest') q = q.orderBy('t.is_pinned', 'desc').orderBy('t.reply_count', 'desc');
    else q = q.orderBy('t.is_pinned', 'desc').orderBy('t.last_reply_at', 'desc');

    const [total, rows] = await Promise.all([
      db('forum_threads').where({ board }).count('id as count').first().then((r) =>
        Number((r as Record<string, unknown>)?.['count'] ?? 0)
      ),
      q.limit(Math.min(limit, 50)).offset(offset),
    ]);

    return {
      data: (rows as Record<string, unknown>[]).map((r) => ({
        ...(r as object),
        view_count: Number(r['view_count']),
        reply_count: Number(r['reply_count']),
        is_pinned: Boolean(r['is_pinned']),
        is_locked: Boolean(r['is_locked']),
      })) as ForumThread[],
      total,
    };
  }

  async createThread(params: {
    board: ForumBoard;
    author_id: string;
    title: string;
    content: string;
  }): Promise<ForumThread> {
    const id = randomUUID();
    const now = new Date();
    await db('forum_threads').insert({
      id,
      board: params.board,
      author_id: params.author_id,
      title: params.title,
      content: params.content,
      view_count: 0,
      reply_count: 0,
      is_pinned: false,
      is_locked: false,
      last_reply_at: now,
      created_at: now,
      updated_at: now,
    });
    return { id, board: params.board, author_id: params.author_id, title: params.title, content: params.content,
      view_count: 0, reply_count: 0, is_pinned: false, is_locked: false, last_reply_at: now, created_at: now };
  }

  async getThread(
    id: string,
    opts: { page?: number; limit?: number } = {}
  ): Promise<
    | {
        thread: ForumThread;
        posts: ForumPost[];
        total_posts: number;
        page: number;
        limit: number;
        has_more: boolean;
      }
    | null
  > {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const row = await db('forum_threads as t')
      .leftJoin('users as u', 't.author_id', 'u.id')
      .where('t.id', id)
      .select('t.*', 'u.nickname as author_nickname')
      .first();
    if (!row) return null;

    // 增加浏览数
    await db('forum_threads').where({ id }).increment('view_count', 1);

    const [postRows, totalPosts] = await Promise.all([
      db('forum_posts as p')
        .leftJoin('users as u', 'p.author_id', 'u.id')
        .where('p.thread_id', id)
        .orderBy('p.floor_number', 'asc')
        .limit(limit)
        .offset(offset)
        .select('p.*', 'u.nickname as author_nickname'),
      db('forum_posts')
        .where('thread_id', id)
        .count('id as count')
        .first()
        .then((result) => Number((result as Record<string, unknown> | undefined)?.['count'] ?? 0)),
    ]);

    const thread = row as Record<string, unknown>;
    return {
      thread: {
        id: thread['id'] as string,
        board: thread['board'] as ForumBoard,
        author_id: thread['author_id'] as string,
        author_nickname: thread['author_nickname'] as string | undefined,
        title: thread['title'] as string,
        content: thread['content'] as string,
        view_count: Number(thread['view_count']) + 1,
        reply_count: Number(thread['reply_count']),
        is_pinned: Boolean(thread['is_pinned']),
        is_locked: Boolean(thread['is_locked']),
        last_reply_at: thread['last_reply_at'] as Date | null,
        created_at: thread['created_at'] as Date,
      },
      posts: (postRows as Record<string, unknown>[]).map((p) => ({
        id: p['id'] as string,
        thread_id: p['thread_id'] as string,
        author_id: p['author_id'] as string,
        author_nickname: p['author_nickname'] as string | undefined,
        content: p['content'] as string,
        floor_number: Number(p['floor_number']),
        reply_to_post_id: p['reply_to_post_id'] as string | null,
        created_at: p['created_at'] as Date,
      })),
      total_posts: totalPosts,
      page,
      limit,
      has_more: offset + (postRows as Record<string, unknown>[]).length < totalPosts,
    };
  }

  async createPost(params: {
    thread_id: string;
    author_id: string;
    content: string;
    reply_to_post_id?: string;
  }): Promise<ForumPost> {
    const thread = await db('forum_threads').where({ id: params.thread_id }).first();
    if (!thread) throw new Error('帖子不存在');
    if (thread['is_locked']) throw new Error('帖子已锁定');

    const id = randomUUID();
    const floor = Number(thread['reply_count']) + 2; // 楼主是1楼
    const now = new Date();

    await db('forum_posts').insert({
      id,
      thread_id: params.thread_id,
      author_id: params.author_id,
      content: params.content,
      floor_number: floor,
      reply_to_post_id: params.reply_to_post_id ?? null,
      created_at: now,
      updated_at: now,
    });

    await db('forum_threads').where({ id: params.thread_id }).update({
      reply_count: db.raw('reply_count + 1'),
      last_reply_at: now,
      updated_at: now,
    });

    const authorRow = await db('users').where({ id: params.author_id }).select('nickname').first();

    return {
      id,
      thread_id: params.thread_id,
      author_id: params.author_id,
      author_nickname: authorRow?.['nickname'] as string | undefined,
      content: params.content,
      floor_number: floor,
      reply_to_post_id: params.reply_to_post_id ?? null,
      created_at: now,
    };
  }

  async getUserActivity(userId: string, opts: { page?: number; limit?: number } = {}): Promise<{
    threads: ForumThread[];
    posts: (ForumPost & { thread_title: string })[];
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const offset = ((opts.page ?? 1) - 1) * limit;

    const [threads, posts] = await Promise.all([
      db('forum_threads').where({ author_id: userId }).orderBy('created_at', 'desc').limit(limit).offset(offset).select(),
      db('forum_posts as p')
        .join('forum_threads as t', 'p.thread_id', 't.id')
        .where('p.author_id', userId)
        .orderBy('p.created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .select('p.*', 't.title as thread_title'),
    ]);

    return {
      threads: (threads as Record<string, unknown>[]).map((r) => ({
        ...(r as object),
        view_count: Number(r['view_count']),
        reply_count: Number(r['reply_count']),
        is_pinned: Boolean(r['is_pinned']),
        is_locked: Boolean(r['is_locked']),
      })) as ForumThread[],
      posts: (posts as Record<string, unknown>[]).map((p) => ({
        id: p['id'] as string,
        thread_id: p['thread_id'] as string,
        author_id: p['author_id'] as string,
        content: p['content'] as string,
        floor_number: Number(p['floor_number']),
        reply_to_post_id: p['reply_to_post_id'] as string | null,
        created_at: p['created_at'] as Date,
        thread_title: p['thread_title'] as string,
      })),
    };
  }
}

export const forumService = new ForumService();
