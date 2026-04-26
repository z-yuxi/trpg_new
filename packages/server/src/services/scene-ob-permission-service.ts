import { db } from '../db';
import { generateId } from '@trpg/shared';

export interface SceneObPermission {
  id: string;
  scene_id: string;
  user_id: string;
  granted_by: string;
  granted_at: Date;
  revoked_at: Date | null;
}

type SceneRow = {
  id: string;
  campaign_id: string;
  type: string;
  created_by?: string | null;
};

async function getScene(sceneId: string): Promise<SceneRow | null> {
  return db('scenes')
    .where({ id: sceneId })
    .select('id', 'campaign_id', 'type', 'created_by')
    .first()
    .catch(() => null);
}

async function isGm(userId: string, campaignId: string): Promise<boolean> {
  const campaign = await db('campaigns').where({ id: campaignId }).select('gm_user_id').first().catch(() => null);
  return Boolean(campaign?.gm_user_id && campaign.gm_user_id === userId);
}

export async function canManageSceneObPermission(sceneId: string, userId: string): Promise<boolean> {
  const scene = await getScene(sceneId);
  if (!scene || scene.type !== 'virtual') return false;

  const gm = await isGm(userId, scene.campaign_id);
  if (gm) return true;

  return Boolean(scene.created_by && scene.created_by === userId);
}

export async function getActiveObPermission(sceneId: string, obUserId: string): Promise<SceneObPermission | null> {
  const row = await db('scene_ob_permissions')
    .where({ scene_id: sceneId, user_id: obUserId })
    .whereNull('revoked_at')
    .orderBy('granted_at', 'desc')
    .first()
    .catch(() => null);

  if (!row) return null;
  return {
    id: String(row.id),
    scene_id: String(row.scene_id),
    user_id: String(row.user_id),
    granted_by: String(row.granted_by),
    granted_at: new Date(row.granted_at),
    revoked_at: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

export async function grantObPermission(sceneId: string, obUserId: string, grantedBy: string): Promise<{ alreadyGranted: boolean; permission: SceneObPermission; campaignId: string; }> {
  const scene = await getScene(sceneId);
  if (!scene) throw Object.assign(new Error('SCENE_NOT_FOUND'), { status: 404 });
  if (scene.type !== 'virtual') throw Object.assign(new Error('NOT_VIRTUAL_SCENE'), { status: 400 });

  const allowed = await canManageSceneObPermission(sceneId, grantedBy);
  if (!allowed) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });

  const existing = await getActiveObPermission(sceneId, obUserId);
  if (existing) {
    return { alreadyGranted: true, permission: existing, campaignId: scene.campaign_id };
  }

  const id = generateId();
  const grantedAt = new Date();
  await db('scene_ob_permissions').insert({
    id,
    scene_id: sceneId,
    user_id: obUserId,
    granted_by: grantedBy,
    granted_at: grantedAt,
    revoked_at: null,
  });

  return {
    alreadyGranted: false,
    permission: {
      id,
      scene_id: sceneId,
      user_id: obUserId,
      granted_by: grantedBy,
      granted_at: grantedAt,
      revoked_at: null,
    },
    campaignId: scene.campaign_id,
  };
}

export async function revokeObPermission(sceneId: string, obUserId: string, revokedBy: string): Promise<{ permission: SceneObPermission; campaignId: string; }> {
  const scene = await getScene(sceneId);
  if (!scene) throw Object.assign(new Error('SCENE_NOT_FOUND'), { status: 404 });
  if (scene.type !== 'virtual') throw Object.assign(new Error('NOT_VIRTUAL_SCENE'), { status: 400 });

  const allowed = await canManageSceneObPermission(sceneId, revokedBy);
  if (!allowed) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });

  const permission = await getActiveObPermission(sceneId, obUserId);
  if (!permission) throw Object.assign(new Error('PERMISSION_NOT_FOUND'), { status: 404 });

  await db('scene_ob_permissions').where({ id: permission.id }).update({ revoked_at: new Date() });
  return { permission, campaignId: scene.campaign_id };
}

export async function listSceneActiveObPermissions(sceneId: string): Promise<SceneObPermission[]> {
  const rows = await db('scene_ob_permissions')
    .where({ scene_id: sceneId })
    .whereNull('revoked_at')
    .orderBy('granted_at', 'asc')
    .catch(() => [] as Array<Record<string, unknown>>);

  return rows.map((row) => ({
    id: String(row.id),
    scene_id: String(row.scene_id),
    user_id: String(row.user_id),
    granted_by: String(row.granted_by),
    granted_at: new Date(String(row.granted_at)),
    revoked_at: row.revoked_at ? new Date(String(row.revoked_at)) : null,
  }));
}

export async function getSceneActiveObPermissionMap(campaignId: string, userId: string): Promise<Map<string, Date>> {
  const rows = await db('scene_ob_permissions as sop')
    .join('scenes as s', 's.id', 'sop.scene_id')
    .where('sop.user_id', userId)
    .whereNull('sop.revoked_at')
    .where('s.campaign_id', campaignId)
    .where('s.type', 'virtual')
    .select('sop.scene_id', 'sop.granted_at')
    .catch(() => [] as Array<{ scene_id: string; granted_at: string | Date }>);

  const map = new Map<string, Date>();
  for (const row of rows) {
    map.set(String(row.scene_id), new Date(row.granted_at));
  }
  return map;
}
