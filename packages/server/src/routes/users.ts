import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { userService } from '../services/user-service';
import { forumService } from '../services/forum-service';
import { notificationService } from '../services/notification-service';
import { db } from '../db';

const router: IRouter = Router();

// GET /api/users/me/stats
router.get('/me/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await userService.getStats(req.user!.id);
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// GET /api/users/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// GET /api/users/me/settings — 一次性返回所有设置字段（供 Settings.vue 回填）
router.get('/me/settings', authMiddleware, async (req, res) => {
  const row = await db('users')
    .where('id', req.user!.id)
    .select(
      'notification_settings',
      'content_preferences',
      'profile_public',
      'online_visible',
      'campaign_history_public',
      'dm_visibility',
      'allow_stats',
      'allow_ai_train',
    )
    .first<Record<string, unknown>>();

  const notif = row?.['notification_settings']
    ? (typeof row['notification_settings'] === 'string'
        ? JSON.parse(row['notification_settings'] as string)
        : row['notification_settings']) as Record<string, unknown>
    : {};
  const contentPrefs = row?.['content_preferences']
    ? (typeof row['content_preferences'] === 'string'
        ? JSON.parse(row['content_preferences'] as string)
        : row['content_preferences']) as Record<string, unknown>
    : {};

  res.json({
    notification: {
      in_app: notif['in_app'] ?? true,
      email: notif['email'] ?? false,
      push: notif['push'] ?? false,
    },
    content: {
      rule_prefs: (contentPrefs['rule_prefs'] as string[]) ?? [],
      genre_prefs: (contentPrefs['genre_prefs'] as string[]) ?? [],
    },
    privacy: {
      profile_visibility: row?.['profile_public'] !== false ? 'public' : 'private',
      dm_visibility: (row?.['dm_visibility'] as string) ?? 'all',
      allow_stats: row?.['allow_stats'] !== false,
      allow_ai_train: row?.['allow_ai_train'] === true,
    },
  });
});

// PUT /api/users/me
router.put('/me', authMiddleware, async (req, res) => {
  const schema = z.object({
    nickname: z.string().min(1).max(32).optional(),
    avatar_url: z.string().min(1).max(512).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const user = await userService.updateProfile(req.user!.id, parsed.data);
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Update failed' });
  }
});

// POST /api/users/me/activate-creator — 仅限非生产环境：一键开通创作者模式（测试用）
router.post('/me/activate-creator', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: '此接口仅限开发环境使用' });
    return;
  }
  try {
    const currentTypes: string[] = Array.isArray(req.user!.user_type) ? req.user!.user_type : [];
    const newTypes = currentTypes.includes('creator') ? currentTypes : [...currentTypes, 'creator'];
    await db('users').where({ id: req.user!.id }).update({
      subscription_type: 'creator',
      user_type: JSON.stringify(newTypes),
    });
    const updated = await userService.findById(req.user!.id);
    res.json({ user: userService.toSafeUser(updated!) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Upgrade failed' });
  }
});

// GET /api/users/me/activity
router.get('/me/activity', authMiddleware, async (req, res) => {
  const { page, limit } = req.query as Record<string, string>;
  const result = await forumService.getUserActivity(req.user!.id, {
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 20,
  });
  res.json(result);
});

router.get('/:uid/profile', async (req, res) => {
  try {
    const profile = await userService.getPublicProfile(req.params['uid']!);
    if (!profile) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(profile);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error)?.message ?? 'Query failed' });
  }
});

// POST /api/users/:uid/follow — 关注用户（幂等）
router.post('/:uid/follow', authMiddleware, async (req, res) => {
  const followerId = req.user!.id;
  const followeeUid = req.params['uid']!;
  if (followerId === followeeUid) return res.status(400).json({ error: 'CANNOT_FOLLOW_SELF' });

  const target = await db('users').where({ uid: Number(followeeUid) }).select('id').first<{ id: string }>();
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  const followeeId = target.id;

  // 幂等 upsert
  await db('user_follows')
    .insert({ follower_id: followerId, followee_id: followeeId })
    .onConflict(['follower_id', 'followee_id'])
    .ignore();

  // 更新缓存计数
  const [fc, flc] = await Promise.all([
    db('user_follows').where('followee_id', followeeId).count('follower_id as c').first<{ c: number | string }>(),
    db('user_follows').where('follower_id', followerId).count('followee_id as c').first<{ c: number | string }>(),
  ]);
  await db('users').where('id', followeeId).update({ follower_count: Number(fc?.c ?? 0) });
  await db('users').where('id', followerId).update({ following_count: Number(flc?.c ?? 0) });

  res.json({ success: true, follower_count: Number(fc?.c ?? 0) });
});

// DELETE /api/users/:uid/follow — 取消关注
router.delete('/:uid/follow', authMiddleware, async (req, res) => {
  const followerId = req.user!.id;
  const followeeUid = req.params['uid']!;

  const target = await db('users').where({ uid: Number(followeeUid) }).select('id').first<{ id: string }>();
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  const followeeId = target.id;

  await db('user_follows').where({ follower_id: followerId, followee_id: followeeId }).delete();

  const [fc, flc] = await Promise.all([
    db('user_follows').where('followee_id', followeeId).count('follower_id as c').first<{ c: number | string }>(),
    db('user_follows').where('follower_id', followerId).count('followee_id as c').first<{ c: number | string }>(),
  ]);
  await db('users').where('id', followeeId).update({ follower_count: Number(fc?.c ?? 0) });
  await db('users').where('id', followerId).update({ following_count: Number(flc?.c ?? 0) });

  res.json({ success: true, follower_count: Number(fc?.c ?? 0) });
});

// GET /api/users/:uid/follow-status — 当前用户是否已关注
router.get('/:uid/follow-status', authMiddleware, async (req, res) => {
  const followerId = req.user!.id;
  const target = await db('users').where({ uid: Number(req.params['uid']!) }).select('id').first<{ id: string }>();
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });
  const row = await db('user_follows').where({ follower_id: followerId, followee_id: target.id }).first();
  res.json({ following: !!row });
});

// ── 粉丝/关注列表辅助：把 user 行转成简单摘要 ────────────────────────────
async function toUserSummary(userId: string) {
  const u = await db('users').where('id', userId).select('uid', 'nickname', 'avatar_url', 'subscription_type').first<Record<string, unknown>>();
  return u ? { id: userId, uid: u['uid'], nickname: u['nickname'], avatar_url: u['avatar_url'] ?? null, subscription_type: u['subscription_type'] } : null;
}

// GET /api/users/:uid/followers — 该用户的粉丝列表
router.get('/:uid/followers', async (req, res) => {
  const target = await db('users').where({ uid: Number(req.params['uid']!) }).select('id').first<{ id: string }>();
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  const { page: rawPage, limit: rawLimit } = req.query as Record<string, string>;
  const page = Math.max(1, Number(rawPage ?? 1));
  const limit = Math.min(Number(rawLimit ?? 20), 100);
  const offset = (page - 1) * limit;

  const rows = await db('user_follows')
    .where('followee_id', target.id)
    .orderBy('created_at', 'desc')
    .limit(limit).offset(offset)
    .select('follower_id');
  const total = await db('user_follows').where('followee_id', target.id).count('follower_id as c').first<{ c: number | string }>();

  const users = await Promise.all(rows.map((r: { follower_id: string }) => toUserSummary(r.follower_id)));
  res.json({ data: users.filter(Boolean), total: Number(total?.c ?? 0) });
});

// GET /api/users/:uid/following — 该用户关注的人列表
router.get('/:uid/following', async (req, res) => {
  const target = await db('users').where({ uid: Number(req.params['uid']!) }).select('id').first<{ id: string }>();
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  const { page: rawPage, limit: rawLimit } = req.query as Record<string, string>;
  const page = Math.max(1, Number(rawPage ?? 1));
  const limit = Math.min(Number(rawLimit ?? 20), 100);
  const offset = (page - 1) * limit;

  const rows = await db('user_follows')
    .where('follower_id', target.id)
    .orderBy('created_at', 'desc')
    .limit(limit).offset(offset)
    .select('followee_id');
  const total = await db('user_follows').where('follower_id', target.id).count('followee_id as c').first<{ c: number | string }>();

  const users = await Promise.all(rows.map((r: { followee_id: string }) => toUserSummary(r.followee_id)));
  res.json({ data: users.filter(Boolean), total: Number(total?.c ?? 0) });
});

router.get('/:uid/campaigns', async (req, res) => {
  try {
    const data = await userService.getUserCampaigns(req.params.uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.get('/:uid/hosted-campaigns', async (req, res) => {
  try {
    const data = await userService.getHostedCampaigns(req.params.uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

router.get('/:uid/created-modules', async (req, res) => {
  try {
    const data = await userService.getUserCreatedModules(req.params.uid);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Query failed' });
  }
});

// PUT /api/users/me/password
router.put('/me/password', authMiddleware, async (req, res) => {
  const schema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(8).max(64),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    await userService.changePassword(req.user!.id, parsed.data.current_password, parsed.data.new_password);
    res.json({ success: true });
  } catch (err: any) {
    const isUserError = err?.message === '当前密码错误';
    res.status(isUserError ? 400 : 500).json({ error: err?.message ?? 'Update failed' });
  }
});

// PUT /api/users/me/privacy
router.put('/me/privacy', authMiddleware, async (req, res) => {
  const schema = z.object({
    profile_public: z.boolean().optional(),
    profile_visibility: z.enum(['public', 'friends', 'private']).optional(),
    online_visible: z.boolean().optional(),
    campaign_history_public: z.boolean().optional(),
    dm_visibility: z.enum(['all', 'following', 'none']).optional(),
    allow_stats: z.boolean().optional(),
    allow_ai_train: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    await userService.updatePrivacySettings(req.user!.id, parsed.data);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error)?.message ?? 'Update failed' });
  }
});

// PUT /api/users/me/notification-settings
router.put('/me/notification-settings', authMiddleware, async (req, res) => {
  const schema = z.object({
    system: z.boolean().optional(),
    recruit: z.boolean().optional(),
    dm: z.boolean().optional(),
    mention: z.boolean().optional(),
    // 前端 Settings.vue 使用的字段
    in_app: z.boolean().optional(),
    email: z.boolean().optional(),
    push: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    await userService.updateNotificationSettings(req.user!.id, parsed.data);
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error)?.message ?? 'Update failed' });
  }
});

// PUT /api/users/me/content-preferences
router.put('/me/content-preferences', authMiddleware, async (req, res) => {
  const schema = z.object({
    rule_prefs: z.array(z.string()).optional(),
    genre_prefs: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed' });
  try {
    // 存入 users.content_preferences（migration 032 新增列）
    await db('users')
      .where('id', req.user!.id)
      .update({ content_preferences: JSON.stringify(parsed.data) });
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error)?.message ?? 'Update failed' });
  }
});

// POST /api/users/me/export-data
// 记录请求后通过通知异步下发下载链接（当前版本仅记录请求）
router.post('/me/export-data', authMiddleware, async (req, res) => {
  try {
    await notificationService.createNotification({
      userId: req.user!.id,
      type: 'system_announcement',
      title: '数据导出请求已收到',
      content: '我们正在为您打包数据，完成后将再次通知您。',
    });
    res.json({ success: true });
  } catch {
    res.json({ success: true }); // 不影响用户体验
  }
});

// POST /api/users/me/delete-account
// 进入 15 天冷静期流程（当前版本仅记录请求）
router.post('/me/delete-account', authMiddleware, async (req, res) => {
  const { confirm: confirmText } = req.body as { confirm?: string };
  if (typeof confirmText !== 'string' || confirmText.trim().length < 1) {
    return res.status(400).json({ error: 'MISSING_CONFIRM' });
  }
  try {
    await notificationService.createNotification({
      userId: req.user!.id,
      type: 'system_announcement',
      title: '注销申请已提交',
      content: '账号将在 15 天冷静期后永久删除。如需取消，请联系客服。',
    });
    res.json({ success: true, cooldown_days: 15 });
  } catch {
    res.json({ success: true, cooldown_days: 15 });
  }
});

export default router;
