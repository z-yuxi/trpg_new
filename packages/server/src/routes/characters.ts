import { Router, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getAuthedUser } from '../middleware/auth-typed';
import { payGate } from '../middleware/pay-gate';
import { characterSheetService, characterInstanceService } from '../services/character-sheet-service';
import { createCharacterPdfBuffer } from '../services/character-pdf-service';
import { exportCSON, importCSON } from '@trpg/shared';
import { db } from '../db';
import { io } from '../app';
import { safeErrorMessage } from '../utils/error-response';

const router: IRouter = Router();

router.use(authMiddleware);

// POST /api/characters/import - 导入 CSON（必须在 /:id 之前注册）
router.post('/import', async (req, res) => {
  try {
    const { cson_text } = req.body;
    if (!cson_text) { res.status(400).json({ error: 'cson_text is required' }); return; }
    const parsed = importCSON(cson_text);
    const sheet = await characterSheetService.create({
      user_id: getAuthedUser(req).id,
      ruleset_id: parsed.ruleset_id,
      name: parsed.name,
      occupation_id: parsed.occupation_id,
      attributes: parsed.attributes,
      skills: parsed.skills,
    });
    res.status(201).json(sheet);
  } catch (err: unknown) {
    res.status(400).json({ error: safeErrorMessage(err, 'Import failed') });
  }
});

// POST /api/characters - 创建角色卡
router.post('/', async (req, res) => {
  try {
    const sheet = await characterSheetService.create({ ...req.body, user_id: getAuthedUser(req).id });
    res.status(201).json(sheet);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Create failed') });
  }
});

// GET /api/characters - 我的角色卡列表
router.get('/', async (req, res) => {
  try {
    const sheets = await characterSheetService.findByUserId(getAuthedUser(req).id);
    res.json(sheets);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// GET /api/characters/:id - 角色卡详情
router.get('/:id', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }
    res.json(sheet);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// PUT /api/characters/:id - 更新角色卡
router.put('/:id', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const allowed = ['name', 'avatar_url', 'background', 'attributes', 'skills', 'occupation_id', 'derived_max', 'equipment', 'avatar_custom_data'];
    const safeBody: Record<string, unknown> = {};
    for (const key of allowed) {
      if ((req.body as Record<string, unknown>)[key] !== undefined) safeBody[key] = (req.body as Record<string, unknown>)[key];
    }
    const updated = await characterSheetService.update(req.params.id, safeBody);
    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Update failed') });
  }
});

// DELETE /api/characters/:id - 删除角色卡
router.delete('/:id', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }
    await characterSheetService.delete(req.params.id);
    res.status(204).send();
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Delete failed') });
  }
});

// POST /api/characters/:id/export - 导出 CSON（免费）
router.post('/:id/export', async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const cson_text = exportCSON(sheet, getAuthedUser(req).nickname ?? 'player');
    res.json({ cson_text });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Export failed') });
  }
});

// POST /api/characters/:id/export/pdf — 导出 PDF（需 Pro/Creator 会员）
router.post('/:id/export/pdf', payGate('character_card_pdf'), async (req, res) => {
  try {
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }
    const buf = await createCharacterPdfBuffer(sheet);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(sheet.name || 'character')}.pdf`
    );
    res.send(buf);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'PDF export failed') });
  }
});

// GET /api/characters/:id/instance?campaign_id=xxx — 获取团内实例数据
router.get('/:id/instance', async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) { res.status(400).json({ error: 'campaign_id is required' }); return; }
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    // 允许：角色所有者 或 该团 GM
    const campaign = await db('campaigns').where({ id: campaign_id as string }).select('gm_user_id').first();
    if (sheet.user_id !== getAuthedUser(req).id && campaign?.['gm_user_id'] !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const instance = await characterInstanceService.getInstance(req.params.id, campaign_id as string);
    if (!instance) { res.status(404).json({ error: 'Instance not found' }); return; }
    res.json(instance);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Query failed') });
  }
});

// PUT /api/characters/:id/instance/:campaignId — 更新团内实例（HP/MP/SAN/装备等）
router.put('/:id/instance/:campaignId', async (req, res) => {
  try {
    const { id, campaignId } = req.params;
    const sheet = await characterSheetService.findById(id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first();
    // 允许：角色所有者 或 GM
    if (sheet.user_id !== getAuthedUser(req).id && campaign?.['gm_user_id'] !== getAuthedUser(req).id) {
      res.status(403).json({ error: 'Forbidden' }); return;
    }
    const { derived_current, temporary_effects, equipment } = req.body;
    const updated = await characterInstanceService.updateInstance(id, campaignId, {
      derived_current,
      temporary_effects,
      equipment,
    });

    // 检测派生值是否超出 max，截断并广播
    const truncatedFields: string[] = [];
    const dc = updated.derived_current ?? {};
    for (const [k, v] of Object.entries(dc)) {
      if (v.current > v.max) {
        truncatedFields.push(k.toUpperCase());
        dc[k] = { ...v, current: v.max };
      }
    }
    if (truncatedFields.length > 0) {
      await characterInstanceService.updateInstance(id, campaignId, { derived_current: dc });
    }

    // 广播 character_state_sync 到同战团所有客户端
    const roomNsp = io.of('/room');
    roomNsp.to(`campaign:${campaignId}`).emit('character_state_sync' as any, {
      character_id: id,
      derived_current: dc,
      truncated_fields: truncatedFields,
    });

    res.json(updated);
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Update failed') });
  }
});

// POST /api/characters/:id/grow — 技能成长同步到模板
router.post('/:id/grow', async (req, res) => {
  try {
    const { skill_name, new_value, campaign_id } = req.body;
    if (!skill_name || new_value === undefined || !campaign_id) {
      res.status(400).json({ error: 'skill_name, new_value, campaign_id are required' }); return;
    }
    const sheet = await characterSheetService.findById(req.params.id);
    if (!sheet) { res.status(404).json({ error: 'Not found' }); return; }
    if (sheet.user_id !== getAuthedUser(req).id) { res.status(403).json({ error: 'Forbidden' }); return; }
    await characterInstanceService.growSkill(req.params.id, campaign_id as string, skill_name as string, Number(new_value));
    res.json({ ok: true });
  } catch (err: unknown) {
    res.status(500).json({ error: safeErrorMessage(err, 'Grow failed') });
  }
});

export default router;
