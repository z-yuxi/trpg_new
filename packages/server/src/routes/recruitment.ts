import { Router, type IRouter } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { recruitmentService } from '../services/recruitment-service';
import { notificationService } from '../services/notification-service';
import { postCommentService } from '../services/post-comment-service';
import { ErrorCode } from '../utils/app-error';
import { safeErrorMessage } from '../utils/error-response';
import { db } from '../db';

// ── 限流策略 ───────────────────────────────────────────────────────────────────
// 防止申请刷量：每用户 IP 每 5 分钟最多申请 10 次
const applyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '申请过于频繁，请 5 分钟后再试', error_code: 'RATE_LIMITED' },
});

// 防止审批接口滥用：每 GM 每分钟最多 60 次（正常操作足够）
const reviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '操作过于频繁，请稍后再试', error_code: 'RATE_LIMITED' },
});

// 成团操作：每 IP 每 10 分钟最多 5 次（防误触/重复提交）
const groupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '成团操作过于频繁，请稍后再试', error_code: 'RATE_LIMITED' },
});

const router: IRouter = Router();

const createSchema = z.object({
  title: z.string().min(1).max(50),
  type: z.enum(['gm_recruit', 'player_seek']),
  ruleset_id: z.string().min(1),
  module_name: z.string().max(100).optional().nullable(),
  player_count_max: z.number().int().min(1).max(20),
  schedule_text: z.string().max(255).optional().nullable(),
  schedule_weekday: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).max(7).optional().nullable(),
  schedule_time_slot: z.enum(['morning', 'afternoon', 'evening', 'night']).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(20)).max(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

// 仅允许编辑内容字段；状态变更通过专用路由（publish/close/dissolve/group）
const updateSchema = z.object({
  title: z.string().min(1).max(50).optional(),
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
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Create failed') });
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
      status: typeof req.query.status === 'string' ? (req.query.status as any) : undefined,
      poster_id: mine === 'posted' ? req.user!.id : undefined,
      applicant_user_id: mine === 'applied' ? req.user!.id : undefined,
      // 已登录的普通浏览：传 viewer_id 查每帖申请状态，不过滤结果
      viewer_id: !mine && req.user ? req.user.id : undefined,
      schedule_weekday: typeof req.query.schedule_weekday === 'string' ? req.query.schedule_weekday : undefined,
      schedule_time_slot: typeof req.query.schedule_time_slot === 'string' ? req.query.schedule_time_slot : undefined,
      min_seats_available: typeof req.query.min_seats === 'string' ? Number(req.query.min_seats) : undefined,
    });

    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
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
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// POST /:id/publish — 发布草稿（draft → open）
router.post('/:id/publish', authMiddleware, async (req, res) => {
  try {
    const post = await recruitmentService.publish(req.params.id, req.user!.id);
    res.json(post);
  } catch (err: any) {
    const status = err.message === '招募帖不存在' ? 404 : err.message === '无权限' ? 403 : 400;
    res.status(status).json({ error: err?.message ?? 'Publish failed' });
  }
});

// POST /:id/close — 手动关闭招募（open/full → closed）
router.post('/:id/close', authMiddleware, async (req, res) => {
  try {
    const post = await recruitmentService.close(req.params.id, req.user!.id);
    res.json(post);
  } catch (err: any) {
    const status = err.message === '招募帖不存在' ? 404 : err.message === '无权限' ? 403 : 400;
    res.status(status).json({ error: err?.message ?? 'Close failed' });
  }
});

// POST /:id/dissolve — 解散团（grouped → dissolved）
router.post('/:id/dissolve', authMiddleware, async (req, res) => {
  try {
    const post = await recruitmentService.dissolve(req.params.id, req.user!.id);
    res.json(post);
  } catch (err: any) {
    const status = err.message === '招募帖不存在' ? 404 : err.message === '无权限' ? 403 : 400;
    res.status(status).json({ error: err?.message ?? 'Dissolve failed' });
  }
});

// POST /applications/:applicationId/confirm — 玩家确认入团（invited → confirmed）
// 必须注册在 /:id 之前，避免路由冲突
router.post('/applications/:applicationId/confirm', authMiddleware, idempotencyMiddleware, async (req, res) => {
  try {
    const application = await recruitmentService.confirmApplication({
      application_id: req.params.applicationId,
      applicant_user_id: req.user!.id,
    });
    res.json(application);
  } catch (err: any) {
    const isExpired = err?.message?.includes('过期');
    const status = err.message === '申请不存在' ? 404 : 400;
    res.status(status).json({
      error: err?.message ?? 'Confirm failed',
      ...(isExpired ? { error_code: ErrorCode.RECRUITMENT_INVITE_EXPIRED } : {}),
    });
  }
});

// POST /:id/apply — 申请加入；?type=waiting 进入候补队列
router.post('/:id/apply', authMiddleware, applyLimiter, idempotencyMiddleware, async (req, res) => {
  const schema = z.object({
    character_id: z.string().optional().nullable(),
    message: z.string().min(1).max(500),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const applyType = req.query.type === 'waiting' ? 'waiting' : 'normal';

  try {
    const application = await recruitmentService.createApplication({
      post_id: req.params.id,
      applicant_user_id: req.user!.id,
      character_id: parsed.data.character_id,
      message: parsed.data.message,
      apply_type: applyType,
    });

    const post = await db('recruitment_posts').where({ id: req.params.id }).select('poster_id', 'title').first();
    if (post && post['poster_id'] !== req.user!.id) {
      notificationService.createNotification({
        userId: post['poster_id'] as string,
        type: 'social',
        title: applyType === 'waiting' ? '你的招募帖有新候补申请' : '你的招募帖有新申请',
        content: `《${post['title'] as string ?? '招募帖'}》收到了新的${applyType === 'waiting' ? '候补' : ''}申请。`,
        metadata: { post_id: req.params.id, application_id: application.id },
      }).catch(() => {});
    }

    res.status(201).json(application);
  } catch (err: any) {
    const isAlreadyApplied = err?.message?.includes('已提交过');
    const isClosed = err?.message?.includes('不接受申请');
    res.status(400).json({
      error: err?.message ?? 'Apply failed',
      ...(isAlreadyApplied ? { error_code: ErrorCode.RECRUITMENT_ALREADY_APPLIED } : {}),
      ...(isClosed ? { error_code: ErrorCode.RECRUITMENT_CLOSED } : {}),
    });
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

// POST /:id/applications/:applicationId/review — GM 审批申请
router.post('/:id/applications/:applicationId/review', authMiddleware, reviewLimiter, async (req, res) => {
  const schema = z.object({
    action: z.enum(['approve', 'reject']),
    reject_reason: z.string().max(500).optional().nullable(),
  });
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
      reject_reason: parsed.data.reject_reason,
    });
    const isApprove = parsed.data.action === 'approve';
    notificationService.createNotification({
      userId: result.applicant_user_id,
      type: 'audit',
      title: isApprove ? '招募申请已通过，请确认入团' : '招募申请已拒绝',
      content: isApprove
        ? '你的招募申请已被GM批准，请在24小时内点击"确认入团"，否则将自动失效。'
        : `你的招募申请未获批准。${parsed.data.reject_reason ? `原因：${parsed.data.reject_reason}` : ''}`,
      metadata: { post_id: req.params.id, application_id: req.params.applicationId },
    }).catch(() => {});
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Review failed' });
  }
});

// POST /:id/group — GM 发起成团（confirmed 玩家 → 创建房间）
router.post('/:id/group', authMiddleware, groupLimiter, idempotencyMiddleware, async (req, res) => {
  const schema = z.object({
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
      module_name: parsed.data.module_name,
    });
    // 通知已确认玩家
    const confirmedApps = await db('recruitment_applications')
      .where({ post_id: req.params.id, status: 'confirmed' })
      .select('applicant_user_id') as Array<Record<string, unknown>>;
    const postRow = await db('recruitment_posts').where({ id: req.params.id }).select('title').first() as Record<string, unknown> | undefined;
    const title = postRow?.['title'] as string ?? '招募帖';
    for (const app of confirmedApps) {
      notificationService.createNotification({
        userId: app['applicant_user_id'] as string,
        type: 'audit',
        title: '你已成功加入团！',
        content: `《${title}》已成团，快去我的团查看吧。`,
        metadata: { campaign_id: result.campaign_id, post_id: req.params.id },
      }).catch(() => {});
    }
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
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Update failed') });
  }
});

// ─── 贴吧式楼层评论系统 ──────────────────────────────────────────────────────

// 获取主楼层列表（分页，每楼附带最近3条楼中楼预览）
router.get('/:id/floors', optionalAuthMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 20)));
    const result = await postCommentService.getFloorsWithComments(req.params.id, page, pageSize, req.user?.id);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// 新增主楼层
router.post('/:id/floors', authMiddleware, async (req, res) => {
  const schema = z.object({ content: z.string().min(1).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    // 校验帖子存在
    const post = await db('recruitment_posts').where({ id: req.params.id }).first();
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const floor = await postCommentService.createFloor(req.params.id, req.user!.id, parsed.data.content);
    // 通知帖主（非本人发楼才通知）
    if ((post as Record<string, unknown>)['poster_id'] !== req.user!.id) {
      notificationService.createNotification({
        userId: (post as Record<string, unknown>)['poster_id'] as string,
        type: 'social',
        title: '你的招募帖有新回复',
        content: `有人在《${(post as Record<string, unknown>)['title'] as string}》下发了新楼。`,
        metadata: { post_id: req.params.id },
      }).catch(() => {});
    }
    res.status(201).json(floor);
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Create floor failed' });
  }
});

// 软删除主楼层
router.delete('/:id/floors/:floorId', authMiddleware, async (req, res) => {
  try {
    await postCommentService.deleteFloor(req.params.floorId, req.user!.id);
    res.status(204).end();
  } catch (err: any) {
    const status = err.message === '无权删除' ? 403 : err.message === '楼层不存在' ? 404 : 500;
    res.status(status).json({ error: err?.message ?? 'Delete failed' });
  }
});

// 获取指定楼层的全部楼中楼（分页）
router.get('/:id/floors/:floorId/comments', optionalAuthMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
    const result = await postCommentService.getFloorComments(req.params.floorId, page, pageSize, req.user?.id);
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// 新增楼中楼
router.post('/:id/floors/:floorId/comments', authMiddleware, async (req, res) => {
  const schema = z.object({
    content: z.string().min(1).max(1000),
    parent_comment_id: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const comment = await postCommentService.createComment(
      req.params.floorId,
      req.user!.id,
      parsed.data.content,
      parsed.data.parent_comment_id ?? undefined,
    );
    // 通知楼主（非本人）
    const floor = await db('post_replies').where({ id: req.params.floorId }).select('user_id').first();
    if (floor && (floor as Record<string, unknown>)['user_id'] !== req.user!.id) {
      notificationService.createNotification({
        userId: (floor as Record<string, unknown>)['user_id'] as string,
        type: 'social',
        title: '你的楼层有新评论',
        content: '有人回复了你的楼层。',
        metadata: { post_id: req.params.id, reply_id: req.params.floorId },
      }).catch(() => {});
    }
    res.status(201).json(comment);
  } catch (err: any) {
    const status = err.message === '楼层不存在' || err.message === '被回复的评论不存在' ? 404
      : err.message === '不允许跨楼层回复' || err.message === '该楼层已删除，无法回复' ? 400 : 500;
    res.status(status).json({ error: err?.message ?? 'Create comment failed' });
  }
});

// 删除楼中楼
router.delete('/:id/floors/:floorId/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    await postCommentService.deleteComment(req.params.commentId, req.user!.id);
    res.status(204).end();
  } catch (err: any) {
    const status = err.message === '无权删除' ? 403 : err.message === '评论不存在' ? 404 : 500;
    res.status(status).json({ error: err?.message ?? 'Delete failed' });
  }
});

// 点赞主楼层
router.post('/:id/floors/:floorId/like', authMiddleware, async (req, res) => {
  try {
    await postCommentService.likeFloor(req.params.floorId, req.user!.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Like failed' });
  }
});

// 取消点赞主楼层
router.delete('/:id/floors/:floorId/like', authMiddleware, async (req, res) => {
  try {
    await postCommentService.unlikeFloor(req.params.floorId, req.user!.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Unlike failed' });
  }
});

// 点赞楼中楼
router.post('/:id/floors/:floorId/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    await postCommentService.likeComment(req.params.commentId, req.user!.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Like failed' });
  }
});

// 取消点赞楼中楼
router.delete('/:id/floors/:floorId/comments/:commentId/like', authMiddleware, async (req, res) => {
  try {
    await postCommentService.unlikeComment(req.params.commentId, req.user!.id);
    res.status(204).end();
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? 'Unlike failed' });
  }
});

export default router;
