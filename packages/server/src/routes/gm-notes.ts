import { Router } from 'express';
import { authMiddleware as requireAuth } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { db } from '../db';
import { generateId } from '@trpg/shared';

const router = Router();

// 验证用户是否为该团 GM
async function verifyGm(campaignId: string, userId: string): Promise<boolean> {
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  return campaign?.gm_user_id === userId;
}

// GET /api/campaigns/:id/gm-notes
router.get('/:id/gm-notes', requireAuth, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const { id: campaignId } = req.params;

  if (!(await verifyGm(campaignId, userId))) {
    return res.status(403).json({ error: '仅 GM 可查看私密笔记' });
  }

  const notes = await db('gm_private_notes')
    .where({ campaign_id: campaignId, gm_user_id: userId })
    .orderBy('created_at', 'desc');

  res.json(notes);
});

// POST /api/campaigns/:id/gm-notes
router.post('/:id/gm-notes', requireAuth, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const { id: campaignId } = req.params;
  const { content } = req.body;

  if (!(await verifyGm(campaignId, userId))) {
    return res.status(403).json({ error: '仅 GM 可添加私密笔记' });
  }
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: '笔记内容不能为空' });
  }

  const id = generateId();
  await db('gm_private_notes').insert({
    id,
    campaign_id: campaignId,
    gm_user_id: userId,
    content: content.trim(),
  });

  const note = await db('gm_private_notes').where({ id }).first();
  res.status(201).json(note);
});

// DELETE /api/campaigns/:id/gm-notes/:noteId
router.delete('/:id/gm-notes/:noteId', requireAuth, async (req, res) => {
  const userId = getAuthedUser(req).id;
  const { id: campaignId, noteId } = req.params;

  if (!(await verifyGm(campaignId, userId))) {
    return res.status(403).json({ error: '仅 GM 可删除私密笔记' });
  }

  const deleted = await db('gm_private_notes')
    .where({ id: noteId, campaign_id: campaignId, gm_user_id: userId })
    .delete();

  if (!deleted) return res.status(404).json({ error: '笔记不存在' });
  res.json({ success: true });
});

export default router;
