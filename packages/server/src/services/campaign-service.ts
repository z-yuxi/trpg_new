import { db } from '../db';
import { generateId, generateRoomCode } from '@trpg/shared';
import type { Campaign, CampaignStatus, Scene, SceneType, HistoryVisibility, GridMap, GridToken, GridOverlay, ScheduledMove, StoryTime } from '@trpg/shared';
import { safeJsonParse } from '../utils/safe-json';

type CampaignWithDisplay = Campaign & {
  cover_url: string | null;
  module_name: string | null;
  ruleset_name: string;
};

function rowToCampaign(row: Record<string, unknown>): CampaignWithDisplay {
  const moduleCover = typeof row['module_cover_url'] === 'string' && row['module_cover_url']
    ? row['module_cover_url'] as string
    : null;
  const rulesetCover = typeof row['ruleset_cover_url'] === 'string' && row['ruleset_cover_url']
    ? row['ruleset_cover_url'] as string
    : null;
  return {
    id: row['id'] as string,
    room_code: row['room_code'] as string,
    name: row['name'] as string,
    ruleset_id: row['ruleset_id'] as string,
    module_id: row['module_id'] as string | null,
    cover_url: moduleCover ?? rulesetCover,
    module_name: (row['module_name'] as string | null) ?? null,
    ruleset_name: (row['ruleset_name'] as string | null) ?? '',
    gm_user_id: row['gm_user_id'] as string,
    assistant_gm_ids: safeJsonParse<string[]>(row['assistant_gm_ids'], []),
    global_story_time: safeJsonParse<StoryTime>(row['global_story_time'], { day: 1, hour: 8, minute: 0 }),
    status: row['status'] as CampaignStatus,
    allow_ob: Boolean(row['allow_ob']),
    is_listed_publicly: Boolean(row['is_listed_publicly']),
    enable_trajectory_matrix: Boolean(row['enable_trajectory_matrix']),
    enable_grid_map: Boolean(row['enable_grid_map']),
    enable_scene_connections: Boolean(row['enable_scene_connections']),
    created_at: row['created_at'] as Date,
  } as CampaignWithDisplay;
}

function rowToScene(row: Record<string, unknown>): Scene {
  return {
    id: row['id'] as string,
    campaign_id: row['campaign_id'] as string,
    name: row['name'] as string,
    type: row['type'] as SceneType,
    description: (row['description'] as string) ?? '',
    history_visibility: row['history_visibility'] as HistoryVisibility,
    visible_history_count: row['visible_history_count'] as number,
    created_at: row['created_at'] as Date,
  };
}

function rowToGridMap(row: Record<string, unknown>): GridMap {
  return {
    id: row['id'] as string,
    campaign_id: row['campaign_id'] as string,
    scene_id: row['scene_id'] as string,
    cols: Number(row['cols'] ?? 12),
    rows: Number(row['rows'] ?? 10),
    cell_size: Number(row['cell_size'] ?? 48),
    background_image_url: (row['background_image_url'] as string) ?? null,
    tokens: safeJsonParse<GridToken[]>(row['tokens'], []),
    overlays: safeJsonParse<GridOverlay[]>(row['overlays'], []),
    updated_at: row['updated_at'] as Date,
  };
}

export class CampaignService {
  async create(params: {
    name: string;
    ruleset_id: string;
    gm_user_id: string;
    module_id?: string;
  }): Promise<Campaign> {
    const id = generateId();
    const room_code = await this.generateUniqueRoomCode();

    await db.transaction(async (trx) => {
      await trx('campaigns').insert({
        id,
        room_code,
        name: params.name,
        ruleset_id: params.ruleset_id,
        module_id: params.module_id ?? null,
        gm_user_id: params.gm_user_id,
        assistant_gm_ids: JSON.stringify([]),
        global_story_time: JSON.stringify({ day: 1, hour: 8, minute: 0 }),
        status: 'preparing',
        allow_ob: false,
        is_listed_publicly: false,
        enable_trajectory_matrix: false,
        enable_grid_map: false,
        enable_scene_connections: false,
      });

      // 在事务内创建默认大厅场景，保证原子性
      const sceneId = generateId();
      await trx('scenes').insert({
        id: sceneId,
        campaign_id: id,
        name: '大厅',
        type: 'lobby',
        history_visibility: 'all',
        visible_history_count: 50,
      });
    });

    return this.findById(id) as Promise<Campaign>;
  }

  async findById(id: string): Promise<Campaign | null> {
    const row = await db('campaigns').where({ id }).first();
    if (!row) return null;
    return rowToCampaign(row);
  }

  async findByRoomCode(room_code: string): Promise<Campaign | null> {
    const row = await db('campaigns').where({ room_code }).first();
    if (!row) return null;
    return rowToCampaign(row);
  }

  async findByUserId(user_id: string): Promise<Campaign[]> {
    const gmQuery = db('campaigns as c')
      .leftJoin('modules as m', 'm.id', 'c.module_id')
      .leftJoin('rulesets as r', 'r.id', 'c.ruleset_id')
      .select(
        'c.*',
        'm.name as module_name',
        'm.cover_url as module_cover_url',
        'r.name as ruleset_name',
        db.raw('NULL as ruleset_cover_url'),
        db.raw("'gm' as role"),
      )
      .where({ 'c.gm_user_id': user_id });

    const playerQuery = db('campaigns as c')
      .join('character_scene_states as css', 'css.campaign_id', 'c.id')
      .join('character_sheets as cs', 'cs.id', 'css.character_id')
      .leftJoin('modules as m', 'm.id', 'c.module_id')
      .leftJoin('rulesets as r', 'r.id', 'c.ruleset_id')
      .where('cs.user_id', user_id)
      .andWhereNot('c.gm_user_id', user_id)
      .select(
        'c.*',
        'm.name as module_name',
        'm.cover_url as module_cover_url',
        'r.name as ruleset_name',
        db.raw('NULL as ruleset_cover_url'),
        db.raw("'player' as role"),
      );

    const rows = await gmQuery
      .union(playerQuery)
      .orderBy('created_at', 'desc');

    return rows.map((row: Record<string, unknown>) => {
      const campaign = rowToCampaign(row);
      return {
        ...campaign,
        role: row['role'] as string,
      };
    }) as Campaign[];
  }

  async update(id: string, updates: Partial<Pick<Campaign, 'name' | 'status' | 'allow_ob' | 'is_listed_publicly'>>): Promise<Campaign> {
    await db('campaigns').where({ id }).update(updates);
    return this.findById(id) as Promise<Campaign>;
  }

  async createScene(params: {
    campaign_id: string;
    name: string;
    type: SceneType;
    history_visibility?: HistoryVisibility;
    visible_history_count?: number;
  }): Promise<Scene> {
    const id = generateId();
    await db('scenes').insert({
      id,
      campaign_id: params.campaign_id,
      name: params.name,
      type: params.type,
      history_visibility: params.history_visibility ?? 'none',
      visible_history_count: params.visible_history_count ?? 50,
    });
    const row = await db('scenes').where({ id }).first();
    return rowToScene(row);
  }

  async listScenes(campaign_id: string): Promise<Scene[]> {
    const rows = await db('scenes').where({ campaign_id });
    return rows.map(rowToScene);
  }

  async getGridMap(campaign_id: string, scene_id: string): Promise<GridMap> {
    const existing = await db('campaign_grid_maps').where({ campaign_id, scene_id }).first();
    if (existing) return rowToGridMap(existing);

    const id = generateId();
    await db('campaign_grid_maps').insert({
      id,
      campaign_id,
      scene_id,
      cols: 12,
      rows: 10,
      cell_size: 48,
      background_image_url: null,
      tokens: JSON.stringify([]),
      overlays: JSON.stringify([]),
    });

    const created = await db('campaign_grid_maps').where({ id }).first();
    return rowToGridMap(created);
  }

  async updateGridMap(
    campaign_id: string,
    scene_id: string,
    updates: Partial<Pick<GridMap, 'cols' | 'rows' | 'cell_size' | 'background_image_url' | 'tokens' | 'overlays'>>
  ): Promise<GridMap> {
    const current = await this.getGridMap(campaign_id, scene_id);

    await db('campaign_grid_maps')
      .where({ campaign_id, scene_id })
      .update({
        cols: updates.cols ?? current.cols,
        rows: updates.rows ?? current.rows,
        cell_size: updates.cell_size ?? current.cell_size,
        background_image_url: updates.background_image_url ?? current.background_image_url,
        tokens: JSON.stringify(updates.tokens ?? current.tokens),
        overlays: JSON.stringify(updates.overlays ?? current.overlays),
        updated_at: db.fn.now(),
      });

    const row = await db('campaign_grid_maps').where({ campaign_id, scene_id }).first();
    return rowToGridMap(row);
  }

  private async generateUniqueRoomCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateRoomCode();
      const existing = await db('campaigns').where({ room_code: code }).first();
      if (!existing) return code;
    }
    throw new Error('Failed to generate unique room code');
  }
}

export class SceneService {
  async findById(id: string): Promise<Scene | null> {
    const row = await db('scenes').where({ id }).first();
    if (!row) return null;
    return rowToScene(row);
  }
}

export class ScheduledMoveService {
  async create(params: {
    character_id: string;
    campaign_id: string;
    to_scene_id: string;
    execute_at_story: StoryTime;
  }): Promise<ScheduledMove> {
    const id = generateId();
    await db('scheduled_moves').insert({
      id,
      character_id: params.character_id,
      campaign_id: params.campaign_id,
      to_scene_id: params.to_scene_id,
      execute_at_story: JSON.stringify(params.execute_at_story),
      status: 'pending',
    });
    return this.findById(id) as Promise<ScheduledMove>;
  }

  async findById(id: string): Promise<ScheduledMove | null> {
    const row = await db('scheduled_moves').where({ id }).first();
    if (!row) return null;
    return {
      id: row['id'] as string,
      character_id: row['character_id'] as string,
      campaign_id: row['campaign_id'] as string,
      to_scene_id: row['to_scene_id'] as string,
      execute_at_story: safeJsonParse<StoryTime | null>(row['execute_at_story'], null),
      status: row['status'] as ScheduledMove['status'],
      created_at: row['created_at'] as Date,
    };
  }

  async listByCampaign(params: {
    campaign_id: string;
    status?: ScheduledMove['status'];
  }): Promise<Array<ScheduledMove & { character_name?: string; to_scene_name?: string }>> {
    let query = db('scheduled_moves as sm')
      .leftJoin('character_sheets as cs', 'sm.character_id', 'cs.id')
      .leftJoin('scenes as sc', 'sm.to_scene_id', 'sc.id')
      .where('sm.campaign_id', params.campaign_id)
      .select(
        'sm.id',
        'sm.character_id',
        'sm.campaign_id',
        'sm.to_scene_id',
        'sm.execute_at_story',
        'sm.status',
        'sm.created_at',
        'cs.name as character_name',
        'sc.name as to_scene_name'
      )
      .orderBy('sm.created_at', 'asc');

    if (params.status) {
      query = query.where('sm.status', params.status);
    }

    const rows = await query;
    return rows.map((row) => ({
      id: row['id'] as string,
      character_id: row['character_id'] as string,
      campaign_id: row['campaign_id'] as string,
      to_scene_id: row['to_scene_id'] as string,
      execute_at_story: safeJsonParse<StoryTime | null>(row['execute_at_story'], null),
      status: row['status'] as ScheduledMove['status'],
      created_at: row['created_at'] as Date,
      character_name: row['character_name'] as string | undefined,
      to_scene_name: row['to_scene_name'] as string | undefined,
    }));
  }

  async updateStatus(id: string, status: ScheduledMove['status']): Promise<void> {
    await db('scheduled_moves').where({ id }).update({ status });
  }
}

export const campaignService = new CampaignService();
export const sceneService = new SceneService();
export const scheduledMoveService = new ScheduledMoveService();
