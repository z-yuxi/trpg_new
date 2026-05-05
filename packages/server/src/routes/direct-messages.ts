/**
 * 私信（Direct Messages）路由
 *
 * GET    /api/messages/conversations              — 我的会话列表（含未读数）
 * POST   /api/messages/conversations              — 发起 / 获取与某用户的会话
 * GET    /api/messages/conversations/:id/messages — 会话历史消息（分页）
 * POST   /api/messages/conversations/:id/messages — 发送消息
 * PUT    /api/messages/conversations/:id/read     — 标记已读
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { db } from '../db';
import { metrics } from '../utils/business-metrics';

const router = Router();

// ── 辅助：确保 user_a_id < user_b_id ─────────────────────────────────────
function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ── 计算一条会话中用户的未读消息数 ──────────────────────────────────────
async function getUnreadCount(convId: string, userId: string): Promise<number> {
  const read = await db('direct_reads')
    .where({ conversation_id: convId, user_id: userId })
    .first<{ last_read_at: string } | undefined>();

  let q = db('direct_messages')
    .where('conversation_id', convId)
    .whereNot('sender_id', userId);
  if (read?.last_read_at) {
    q = q.where('created_at', '>', read.last_read_at);
  }
  const row = await q.count('id as c').first<{ c: string | number }>();
  return Number(row?.c ?? 0);
}

// ── GET /api/messages/conversations ──────────────────────────────────────
router.get('/conversations', authMiddleware, async (req, res) => {
  const userId = getAuthedUser(req).id;

  const rows = await db('direct_conversations as dc')
    .where('dc.user_a_id', userId)
    .orWhere('dc.user_b_id', userId)
    .orderBy('dc.last_message_at', 'desc')
    .select('dc.*');

  const result = await Promise.all(
    (rows as Record<string, unknown>[]).map(async (row) => {
      const otherId = String(row['user_a_id'] === userId ? row['user_b_id'] : row['user_a_id']);
      const other = await db('users').where('id', otherId).first<{ id: string; nickname: string; avatar_url?: string }>();
      const unread = await getUnreadCount(String(row['id']), userId);
      return {
        id: row['id'],
        other_user: {
          id: other?.id ?? otherId,
          nickname: other?.nickname ?? '未知用户',
          avatar_url: other?.avatar_url ?? null,
        },
        last_message: row['last_message'] ?? '',
        last_message_at: row['last_message_at'] ?? row['created_at'],
        unread_count: unread,
      };
    }),
  );

  res.json(result);
});

// ── POST /api/messages/conversations ─────────────────────────────────────
// body: { target_user_id: string }
// 幂等：若已存在则直接返回
router.post('/conversations', authMiddleware, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const { target_user_id } = req.body as { target_user_id?: string };
  if (!target_user_id || typeof target_user_id !== 'string') {
    return res.status(400).json({ error: 'MISSING_TARGET_USER_ID' });
  }
  if (target_user_id === userId) {
    return res.status(400).json({ error: 'CANNOT_MESSAGE_SELF' });
  }

  const target = await db('users').where('id', target_user_id).first<{ id: string; nickname: string; avatar_url?: string }>();
  if (!target) return res.status(404).json({ error: 'USER_NOT_FOUND' });

  const [aId, bId] = sortedPair(userId, target_user_id);
  let conv = await db('direct_conversations').where({ user_a_id: aId, user_b_id: bId }).first<Record<string, unknown>>();
  if (!conv) {
    const id = randomUUID();
    await db('direct_conversations').insert({ id, user_a_id: aId, user_b_id: bId });
    conv = await db('direct_conversations').where({ id }).first<Record<string, unknown>>();
  }

  const unread = await getUnreadCount(String(conv!['id']), userId);
  res.json({
    id: conv!['id'],
    other_user: { id: target.id, nickname: target.nickname, avatar_url: target.avatar_url ?? null },
    last_message: conv!['last_message'] ?? '',
    last_message_at: conv!['last_message_at'] ?? conv!['created_at'],
    unread_count: unread,
  });
});

// ── GET /api/messages/conversations/:id/messages ──────────────────────────
router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const convId = req.params['id']!;

  const conv = await db('direct_conversations')
    .where('id', convId)
    .where(function () {
      this.where('user_a_id', userId).orWhere('user_b_id', userId);
    })
    .first<Record<string, unknown>>();
  if (!conv) return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });

  const { before, limit: rawLimit } = req.query as Record<string, string>;
  const limit = Math.min(Number(rawLimit ?? 50), 100);

  let q = db('direct_messages').where('conversation_id', convId);
  if (before) q = q.where('id', '<', before);
  const rows = await q.orderBy('created_at', 'asc').limit(limit).select();

  res.json(
    (rows as Record<string, unknown>[]).map((r) => ({
      id: String(r['id']),
      sender_id: r['sender_id'],
      content: r['content'],
      created_at: r['created_at'],
      type: r['message_type'] ?? 'text',
      image_url: r['image_url'] ?? null,
    })),
  );
});

// ── POST /api/messages/conversations/:id/messages ─────────────────────────
router.post('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const convId = req.params['id']!;

  const conv = await db('direct_conversations')
    .where('id', convId)
    .where(function () {
      this.where('user_a_id', userId).orWhere('user_b_id', userId);
    })
    .first<Record<string, unknown>>();
  if (!conv) return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });

  const { content, type = 'text', image_url } = req.body as { content?: string; type?: string; image_url?: string };
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'EMPTY_CONTENT' });
  }

  try {
    const [msgId] = await db('direct_messages').insert({
      conversation_id: convId,
      sender_id: userId,
      content: content.trim(),
      message_type: type === 'image' ? 'image' : 'text',
      image_url: image_url ?? null,
    });

    const msg = await db('direct_messages').where('id', msgId).first<Record<string, unknown>>();

    // 更新会话摘要
    await db('direct_conversations').where('id', convId).update({
      last_message: content.trim().slice(0, 100),
      last_message_at: new Date().toISOString(),
    });

    // 更新发送者已读时间
    await db('direct_reads')
      .insert({ conversation_id: convId, user_id: userId, last_read_at: new Date().toISOString() })
      .onConflict(['conversation_id', 'user_id'])
      .merge({ last_read_at: new Date().toISOString() });

    res.status(201).json({
      id: String(msg!['id']),
      sender_id: userId,
      content: content.trim(),
      created_at: msg!['created_at'],
      type: msg!['message_type'] ?? 'text',
      image_url: msg!['image_url'] ?? null,
    });
  } catch (err) {
    metrics.inc('message_send_failed');
    throw err;
  }
});

// ── PUT /api/messages/conversations/:id/read ──────────────────────────────
router.put('/conversations/:id/read', authMiddleware, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const convId = req.params['id']!;

  const conv = await db('direct_conversations')
    .where('id', convId)
    .where(function () {
      this.where('user_a_id', userId).orWhere('user_b_id', userId);
    })
    .first();
  if (!conv) return res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });

  await db('direct_reads')
    .insert({ conversation_id: convId, user_id: userId, last_read_at: new Date().toISOString() })
    .onConflict(['conversation_id', 'user_id'])
    .merge({ last_read_at: new Date().toISOString() });

  res.json({ success: true });
});

export default router;
