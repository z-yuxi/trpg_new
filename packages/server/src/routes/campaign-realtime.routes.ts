/**
 * campaign-realtime.routes.ts — 战役实时推送端点
 *
 * 职责：需要触发 Socket.IO 推送的 HTTP 端点。
 *   - POST /:id/scenes/:sceneId/ob-permissions/grant
 *   - POST /:id/scenes/:sceneId/ob-permissions/revoke
 *
 * 禁止：纯读/写操作（分别放 campaign-read/write）。
 */

import { Router } from 'express';
import { safeErrorMessage } from '../utils/error-response';
import { getAuthedUser } from '../middleware/auth-typed';
import { grantObPermission, revokeObPermission } from '../services/scene-ob-permission-service';
import { db } from '../db';
import { redis, RedisKeys } from '../db/redis';
import { io } from '../app';
import { sceneObPermissionSchema } from './campaign-utils';
import { logError } from '../utils/structured-logger';

export const campaignRealtimeRouter = Router();

// POST /api/campaigns/:id/scenes/:sceneId/ob-permissions/grant
campaignRealtimeRouter.post('/:id/scenes/:sceneId/ob-permissions/grant', async (req, res) => {
  const parsed = sceneObPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const scene = await db('scenes')
      .where({ id: req.params.sceneId, campaign_id: req.params.id })
      .first();
    if (!scene) { res.status(404).json({ error: 'SCENE_NOT_FOUND' }); return; }

    const result = await grantObPermission(req.params.sceneId, parsed.data.user_id, getAuthedUser(req).id);

    // 推送到被授权用户的个人频道
    const socketId = await redis.get(RedisKeys.userSocket(parsed.data.user_id));
    if (socketId) {
      io.to(socketId).emit('ob_permission_granted', {
        campaign_id: result.campaignId,
        scene_id: req.params.sceneId,
        user_id: parsed.data.user_id,
        granted_at: result.permission.granted_at,
      });
    }

    res.status(result.alreadyGranted ? 200 : 201).json(result.permission);
  } catch (err: unknown) {
    const status =
      typeof (err as Record<string, unknown>)?.status === 'number'
        ? ((err as Record<string, unknown>).status as number)
        : 500;
    logError('CAMPAIGNS_GRANT_OB_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    res.status(status).json({ error: safeErrorMessage(err, '授权失败') });
  }
});

// POST /api/campaigns/:id/scenes/:sceneId/ob-permissions/revoke
campaignRealtimeRouter.post('/:id/scenes/:sceneId/ob-permissions/revoke', async (req, res) => {
  const parsed = sceneObPermissionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const scene = await db('scenes')
      .where({ id: req.params.sceneId, campaign_id: req.params.id })
      .first();
    if (!scene) { res.status(404).json({ error: 'SCENE_NOT_FOUND' }); return; }

    const result = await revokeObPermission(req.params.sceneId, parsed.data.user_id, getAuthedUser(req).id);

    const socketId = await redis.get(RedisKeys.userSocket(parsed.data.user_id));
    if (socketId) {
      io.to(socketId).emit('ob_permission_revoked', {
        campaign_id: result.campaignId,
        scene_id: req.params.sceneId,
        user_id: parsed.data.user_id,
      });
    }

    res.json({ ok: true });
  } catch (err: unknown) {
    const status =
      typeof (err as Record<string, unknown>)?.status === 'number'
        ? ((err as Record<string, unknown>).status as number)
        : 500;
    logError('CAMPAIGNS_REVOKE_OB_FAILED', 'medium', err instanceof Error ? err.message : String(err));
    res.status(status).json({ error: safeErrorMessage(err, '撤销授权失败') });
  }
});
