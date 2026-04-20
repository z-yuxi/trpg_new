import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { RecruitmentService } from '../services/recruitment-service';
import { notificationService } from '../services/notification-service';
import { db } from '../db';

const router: IRouter = Router();
const recruitmentService = new RecruitmentService();

const createSchema = z.object({
  title: z.string().min(1).max(50),
  type: z.enum(['gm_recruit', 'player_seek']),
  ruleset_id: z.string().min(1),
  module_name: z.string().max(100).optional().nullable(),
  player_count_max: z.number().int().min(1).max(20),
  schedule_text: z.string().max(255).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(20)).max(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(50).optional(),
  status: z.enum(['open', 'closed', 'full']).optional(),
  module_name: z.string().max(100).optional().nullable(),
  player_count_max: z.number().int().min(1).max(20).optional(),
  schedule_text: z.string().max(255).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(20)).max(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

router.post('/', authMiddleware, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const post = await recruitmentService.create({
      ...parsed.data,
      poster_id: req.user!.id,
    });
    res.status(201).json(post);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Create failed' });
  }
});

router.get('/', optionalAuthMiddleware, async (req, res) => {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const mine = req.query.mine === 'applied' || req.query.mine === 'posted' ? req.query.mine : undefined;

    if (mine && !req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await recruitmentService.list({
      page,
      limit,
      sort: req.query.sort === 'oldest' || req.query.sort === 'hottest' ? req.query.sort : 'latest',
      keyword: typeof req.query.keyword === 'string' ? req.query.keyword.trim() : undefined,
      tag: typeof req.query.tag === 'string' ? req.query.tag.trim() : undefined,
      type: req.query.type as 'gm_recruit' | 'player_seek' | undefined,
      ruleset_id: typeof req.query.ruleset_id === 'string' ? req.query.ruleset_id : undefined,
      status: req.query.status as 'open' | 'full' | 'grouped' | 'closed' | undefined,
      poster_id: mine === 'posted' ? req.user!.id : undefined,
      applicant_user_id: mine === 'applied' ? req.user!.id : undefined,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  try {
    const detail = await recruitmentService.getDetail(req.params.id, req.user?.id);
    if (!detail) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(detail);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.post('/:id/apply', authMiddleware, async (req, res) => {
  const schema = z.object({
    character_id: z.string().optional().nullable(),
    message: z.string().min(1).max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const application = await recruitmentService.createApplication({
      post_id: req.params.id,
      applicant_user_id: req.user!.id,
      character_id: parsed.data.character_id,
      message: parsed.data.message,
    });

    const post = await db('recruitment_posts').where({ id: req.params.id }).select('poster_id', 'title').first();
    if (post && post['poster_id'] !== req.user!.id) {
      notificationService.createNotification({
        userId: post['poster_id'] as string,
        type: 'social',
        title: '你的招募帖有新申请',
        content: `《${post['title'] as string ?? '招募帖'}》收到了新的加入申请。`,
        metadata: { post_id: req.params.id, application_id: application['id'] },
      }).catch(() => {});
    }

    res.status(201).json(application);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Apply failed' });
  }
});

router.post('/:id/comments', authMiddleware, async (req, res) => {
  const schema = z.object({ content: z.string().min(1).max(1000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const comment = await recruitmentService.createComment({
      post_id: req.params.id,
      user_id: req.user!.id,
      content: parsed.data.content,
    });
    // 通知帖主（非本人评论才通知）
    const post = await db('recruitment_posts').where({ id: req.params.id }).select('poster_id', 'title').first();
    if (post && post['poster_id'] !== req.user!.id) {
      notificationService.createNotification({
        userId: post['poster_id'] as string,
        type: 'social',
        title: '你的招募帖有新评论',
        content: `有人评论了你的招募帖《${post['title']}》。`,
        metadata: { post_id: req.params.id },
      }).catch(() => {});
    }
    res.status(201).json(comment);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Comment failed' });
  }
});

router.post('/:id/applications/:applicationId/review', authMiddleware, async (req, res) => {
  const schema = z.object({ action: z.enum(['approve', 'reject']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await recruitmentService.reviewApplication({
      post_id: req.params.id,
      application_id: req.params.applicationId,
      owner_id: req.user!.id,
      action: parsed.data.action,
    });
    // 通知申请者
    const applicantUserId = (result as Record<string, unknown>)['applicant_user_id'] as string | undefined;
    if (applicantUserId) {
      const isApprove = parsed.data.action === 'approve';
      notificationService.createNotification({
        userId: applicantUserId,
        type: 'audit',
        title: isApprove ? '招募申请已通过' : '招募申请已拒绝',
        content: isApprove
          ? '你的招募申请已被GM批准，等待成团通知。'
          : '你的招募申请未获批准，可继续寻找其他团。',
        metadata: { post_id: req.params.id, application_id: req.params.applicationId },
      }).catch(() => {/* 通知失败不影响主流程 */});
    }
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Review failed' });
  }
});

router.post('/:id/form-group', authMiddleware, async (req, res) => {
  const schema = z.object({
    selected_application_ids: z.array(z.string()).min(1),
    module_name: z.string().max(100).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await recruitmentService.formGroup({
      post_id: req.params.id,
      owner_id: req.user!.id,
      selected_application_ids: parsed.data.selected_application_ids,
      module_name: parsed.data.module_name,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Group formation failed' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const post = await recruitmentService.findById(req.params.id);
    if (!post) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (post.poster_id !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const updated = await recruitmentService.update(req.params.id, parsed.data);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

export default router;
