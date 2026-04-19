import { generateId } from '@trpg/shared';
import { db } from '../db';

export type ClueTheme = 'river' | 'blur' | 'fragment' | 'wave' | 'ancient' | 'blood' | 'ash' | 'cyber';

export interface CampaignClue {
  id: string;
  campaign_id: string;
  title: string;
  content: string;
  theme: ClueTheme;
  is_revealed: boolean;
  revealed_to: string[] | null;
  revealed_at: Date | null;
  created_at: Date;
}

function rowToClue(row: Record<string, unknown>): CampaignClue {
  return {
    id: row['id'] as string,
    campaign_id: row['campaign_id'] as string,
    title: row['title'] as string,
    content: row['content'] as string,
    theme: row['theme'] as ClueTheme,
    is_revealed: Boolean(row['is_revealed']),
    revealed_to: row['revealed_to']
      ? (typeof row['revealed_to'] === 'string' ? JSON.parse(row['revealed_to'] as string) : row['revealed_to'] as string[])
      : null,
    revealed_at: (row['revealed_at'] as Date | null) ?? null,
    created_at: row['created_at'] as Date,
  };
}

class ClueService {
  async listByCampaign(campaignId: string): Promise<CampaignClue[]> {
    const rows = await db('campaign_clues').where({ campaign_id: campaignId }).orderBy('created_at', 'desc');
    return rows.map((row) => rowToClue(row as Record<string, unknown>));
  }

  async create(params: {
    campaign_id: string;
    title: string;
    content: string;
    theme: ClueTheme;
    is_revealed?: boolean;
    revealed_to?: string[] | null;
  }): Promise<CampaignClue> {
    const id = generateId();
    const revealed = params.is_revealed ?? false;
    const revealedAt = revealed ? new Date() : null;
    await db('campaign_clues').insert({
      id,
      campaign_id: params.campaign_id,
      title: params.title,
      content: params.content,
      theme: params.theme,
      is_revealed: revealed,
      revealed_to: params.revealed_to ? JSON.stringify(params.revealed_to) : null,
      revealed_at: revealedAt,
    });
    const row = await db('campaign_clues').where({ id }).first();
    return rowToClue(row as Record<string, unknown>);
  }

  async update(id: string, data: Partial<Pick<CampaignClue, 'title' | 'content' | 'theme' | 'is_revealed' | 'revealed_to'>>): Promise<CampaignClue | null> {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData['title'] = data.title;
    if (data.content !== undefined) updateData['content'] = data.content;
    if (data.theme !== undefined) updateData['theme'] = data.theme;
    if (data.is_revealed !== undefined) {
      updateData['is_revealed'] = data.is_revealed;
      updateData['revealed_at'] = data.is_revealed ? new Date() : null;
    }
    if (data.revealed_to !== undefined) {
      updateData['revealed_to'] = data.revealed_to ? JSON.stringify(data.revealed_to) : null;
    }

    await db('campaign_clues').where({ id }).update(updateData);
    const row = await db('campaign_clues').where({ id }).first();
    return row ? rowToClue(row as Record<string, unknown>) : null;
  }
}

export const clueService = new ClueService();