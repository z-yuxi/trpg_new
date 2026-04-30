import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { forumService, type ForumBoard, type ThreadSort } from '../services/forum-service';
import { notificationService } from '../services/notification-service';
import { db } from '../db';

const router = Router();

const BOARDS: ForumBoard[] = ['tips', 'share', 'lounge'];

// GET /api/forum/boards/:board/threads
router.get('/boards/:board/threads', optionalAuthMiddleware, async (req, res) => {
  const board = req.params['board'] as ForumBoard;
  if (!BOARDS.includes(board)) return res.status(400).json({ error: 'Invalid board' });

  const { sort = 'latest_reply', page, limit, keyword, days } = req.query as Record<string, string>;
  const result = await forumService.listThreads({
    board,
    sort: sort as ThreadSort,
    keyword: keyword?.trim() || undefined,
    days: days ? Number(days) : undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });
  res.json(result);
});

// POST /api/forum/threads
router.post('/threads', authMiddleware, async (req, res) => {
  const schema = z.object({
    board: z.enum(['tips', 'share', 'lounge']),
    title: z.string().min(2).max(200),
    content: z.string().min(1).max(10000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  try {
    const thread = await forumService.createThread({
      board: parsed.data.board,
      author_id: req.user!.id,
      title: parsed.data.title,
      content: parsed.data.content,
    });
    res.status(201).json(thread);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Create failed' });
  }
});

// GET /api/forum/threads/:id
router.get('/threads/:id', optionalAuthMiddleware, async (req, res) => {
  const { page, limit } = req.query as Record<string, string>;
  const thread = await forumService.getThread(req.params['id']!, {
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });
  if (!thread) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json(thread);
});

// POST /api/forum/threads/:id/posts
router.post('/threads/:id/posts', authMiddleware, async (req, res) => {
  const schema = z.object({
    content: z.string().min(1).max(10000),
    reply_to_post_id: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });

  try {
    const post = await forumService.createPost({
      thread_id: req.params['id']!,
      author_id: req.user!.id,
      content: parsed.data.content,
      reply_to_post_id: parsed.data.reply_to_post_id,
    });

    const [threadRow, replyTargetRow] = await Promise.all([
      db('forum_threads').where({ id: req.params['id']! }).select('author_id', 'title').first(),
      parsed.data.reply_to_post_id
        ? db('forum_posts as p')
          .leftJoin('users as u', 'p.author_id', 'u.id')
          .where('p.id', parsed.data.reply_to_post_id)
          .select('p.author_id', 'p.floor_number', 'u.nickname as author_nickname')
          .first()
        : Promise.resolve(null),
    ]);

    const threadAuthorId = threadRow?.['author_id'] as string | undefined;
    if (threadAuthorId && threadAuthorId !== req.user!.id) {
      notificationService.createNotification({
        userId: threadAuthorId,
        type: 'social',
        title: '你的帖子有新回复',
        content: `《${threadRow?.['title'] as string ?? '帖子'}》收到了新的回复。`,
        metadata: { thread_id: req.params['id']!, post_id: post.id },
      }).catch(() => {});
    }

    const quotedAuthorId = replyTargetRow?.['author_id'] as string | undefined;
    if (quotedAuthorId && quotedAuthorId !== req.user!.id && quotedAuthorId !== threadAuthorId) {
      notificationService.createNotification({
        userId: quotedAuthorId,
        type: 'social',
        title: '你的回复被引用',
        content: `你在 ${replyTargetRow?.['floor_number'] as number ?? '?'} 楼的回复被其他玩家引用了。`,
        metadata: { thread_id: req.params['id']!, post_id: post.id, reply_to_post_id: parsed.data.reply_to_post_id },
      }).catch(() => {});
    }

    res.status(201).json(post);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Reply failed' });
  }
});

export default router;
