import { Router, type IRouter } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { exportCampaignLog } from '../services/log-export-service';

const router: IRouter = Router();

const exportSchema = z.object({
  campaign_id: z.string().min(1),
  format: z.enum(['json', 'markdown']).default('json'),
  scene_ids: z.array(z.string()).optional(),
});

// POST /api/logs/export  — 导出 campaign 日志（ILF 格式）
router.post('/export', authMiddleware, async (req, res) => {
  const parsed = exportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await exportCampaignLog({
      ...parsed.data,
      requester_id: req.user!.id,
    });

    if (parsed.data.format === 'markdown') {
      res.type('text/markdown').send(result);
    } else {
      res.type('application/json').send(result);
    }
  } catch (err: any) {
    const status = err?.status ?? 500;
    res.status(status).json({ error: err?.message ?? 'Internal server error' });
  }
});

export default router;
