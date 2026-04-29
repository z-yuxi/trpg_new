import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { payGate } from '../middleware/pay-gate';
import { exportCampaignLog } from '../services/log-export-service';
import { db } from '../db';

const router: IRouter = Router();

const booleanFromQuery = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

const querySchema = z.object({
  perspective: z.enum(['my', 'full', 'scene']).default('my'),
  sort: z.enum(['strict', 'scene_first', 'main_interleave']).default('strict'),
  format: z.enum(['pdf', 'md', 'txt', 'ilf']).default('md'),
  scenes: z.string().optional(),
  include_ooc: booleanFromQuery.default(true),
  include_system: booleanFromQuery.default(true),
  include_dice_details: booleanFromQuery.default(true),
  simulate_user_id: z.string().min(1).optional(),
  preview: booleanFromQuery.default(false),
});

const legacyBodySchema = z.object({
  campaign_id: z.string().min(1),
  format: z.enum(['json', 'markdown', 'text']).default('json'),
  mode: z.enum(['player', 'full', 'scene']).default('player'),
  sort_strategy: z.enum(['chronological', 'scene', 'interleave', 'custom']).default('chronological'),
  simulate_user_id: z.string().min(1).optional(),
  scene_ids: z.array(z.string()).optional(),
  include_ooc: z.boolean().optional(),
  include_system: z.boolean().optional(),
  include_dice_details: z.boolean().optional(),
});

function sendExportFile(res: any, result: Awaited<ReturnType<typeof exportCampaignLog>>) {
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
  res.send(result.body);
}

router.get('/:campaignId/export', authMiddleware, payGate('log_export'), async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    // simulate_user_id 仅允许 GM 使用
    if (parsed.data.simulate_user_id && parsed.data.simulate_user_id !== req.user!.id) {
      const campaign = await db('campaigns').where({ id: req.params['campaignId']! }).select('gm_user_id').first();
      if (!campaign || campaign.gm_user_id !== req.user!.id) {
        res.status(403).json({ error: 'Only GM can simulate other user views' });
        return;
      }
    }

    const result = await exportCampaignLog({
      campaignId: req.params['campaignId']!,
      perspective: parsed.data.perspective,
      sort: parsed.data.sort,
      format: parsed.data.format,
      requesterId: req.user!.id,
      sceneIds: parsed.data.scenes ? parsed.data.scenes.split(',').map((id) => id.trim()).filter(Boolean) : undefined,
      includeOoc: parsed.data.include_ooc,
      includeSystem: parsed.data.include_system,
      includeDiceDetails: parsed.data.include_dice_details,
      simulateUserId: parsed.data.simulate_user_id,
    });

    if (parsed.data.preview) {
      res.json({
        preview: result.previewText,
        total_messages: result.totalMessages,
        content_type: result.contentType,
        file_name: result.fileName,
      });
      return;
    }

    sendExportFile(res, result);
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ error: err?.message ?? 'Internal server error' });
  }
});

// POST /api/logs/export 兼容旧调用
router.post('/export', authMiddleware, payGate('log_export'), async (req, res) => {
  const parsed = legacyBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {    // simulate_user_id 仅允许 GM 使用
    if (parsed.data.simulate_user_id && parsed.data.simulate_user_id !== req.user!.id) {
      const campaign = await db('campaigns').where({ id: parsed.data.campaign_id }).select('gm_user_id').first();
      if (!campaign || campaign.gm_user_id !== req.user!.id) {
        res.status(403).json({ error: 'Only GM can simulate other user views' });
        return;
      }
    }
    const result = await exportCampaignLog({
      campaignId: parsed.data.campaign_id,
      perspective: parsed.data.mode === 'player' ? 'my' : parsed.data.mode,
      sort: parsed.data.sort_strategy === 'scene'
        ? 'scene_first'
        : parsed.data.sort_strategy === 'chronological'
          ? 'strict'
          : 'main_interleave',
      format: parsed.data.format === 'json' ? 'ilf' : parsed.data.format === 'markdown' ? 'md' : 'txt',
      requesterId: req.user!.id,
      sceneIds: parsed.data.scene_ids,
      includeOoc: parsed.data.include_ooc,
      includeSystem: parsed.data.include_system,
      includeDiceDetails: parsed.data.include_dice_details,
      simulateUserId: parsed.data.simulate_user_id,
    });

    if (typeof result.body === 'string') {
      res.type(result.contentType).send(result.body);
      return;
    }

    res.type('application/octet-stream').send(result.body);
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ error: err?.message ?? 'Internal server error' });
  }
});

export default router;
