import { db } from '../db';
import { generateId, generateRoomCode } from '@trpg/shared';
import type { Campaign, CampaignStatus, Scene, SceneType, HistoryVisibility, ScheduledMove, StoryTime } from '@trpg/shared';

function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row['id'] as string,
    room_code: row['room_code'] as string,
    name: row['name'] as string,
    ruleset_id: row['ruleset_id'] as string,
    module_id: row['module_id'] as string | null,
    gm_user_id: row['gm_user_id'] as string,
    assistant_gm_ids: typeof row['assistant_gm_ids'] === 'string'
      ? JSON.parse(row['assistant_gm_ids'] as string)
      : row['assistant_gm_ids'] as string[],
    global_story_time: typeof row['global_story_time'] === 'string'
      ? JSON.parse(row['global_story_time'] as string)
      : row['global_story_time'] as StoryTime,
    status: row['status'] as CampaignStatus,
    allow_ob: Boolean(row['allow_ob']),
    is_listed_publicly: Boolean(row['is_listed_publicly']),
    enable_trajectory_matrix: Boolean(row['enable_trajectory_matrix']),
    enable_grid_map: Boolean(row['enable_grid_map']),
    enable_scene_connections: Boolean(row['enable_scene_connections']),
    created_at: row['created_at'] as Date,
  };
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

export class CampaignService {
  async create(params: {
    name: string;
    ruleset_id: string;
    gm_user_id: string;
    module_id?: string;
  }): Promise<Campaign> {
    const id = generateId();
    const room_code = await this.generateUniqueRoomCode();

    await db('campaigns').insert({
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

    // Create default lobby scene
    await this.createScene({
      campaign_id: id,
      name: '大厅',
      type: 'lobby',
      history_visibility: 'all',
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
    const gmQuery = db('campaigns')
      .select('campaigns.*', db.raw("'gm' as role"))
      .where({ gm_user_id: user_id });

    const playerQuery = db('campaigns as c')
      .join('character_scene_states as css', 'css.campaign_id', 'c.id')
      .join('character_sheets as cs', 'cs.id', 'css.character_id')
      .where('cs.user_id', user_id)
      .andWhereNot('c.gm_user_id', user_id)
      .select('c.*', db.raw("'player' as role"));

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
      execute_at_story: typeof row['execute_at_story'] === 'string'
        ? JSON.parse(row['execute_at_story'] as string)
        : row['execute_at_story'] as StoryTime,
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
      execute_at_story: typeof row['execute_at_story'] === 'string'
        ? JSON.parse(row['execute_at_story'] as string)
        : row['execute_at_story'] as StoryTime,
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
