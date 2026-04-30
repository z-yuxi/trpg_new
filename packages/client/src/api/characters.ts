/**
 * 角色卡
 * 产品设计依据：附录 D05：角色卡系统产品设计
 */
import { api } from '../utils/api';
import type { CharacterSheet } from '@trpg/shared';

function key(): string { return crypto.randomUUID(); }

export interface CharacterListItem {
  id: string;
  name: string;
  ruleset_id: string;
  ruleset_name?: string;
  avatar_url?: string | null;
  character_code?: string;
  status?: string;
  created_at?: string;
}

export function listMyCharacters(): Promise<CharacterListItem[]> {
  return api.get('/users/me/characters');
}

export function getCharacter(id: string): Promise<CharacterSheet> {
  return api.get(`/characters/${id}`);
}

export function updateCharacter(id: string, payload: Partial<CharacterSheet>): Promise<CharacterSheet> {
  return api.put(`/characters/${id}`, payload);
}

export function createCharacter(payload: { ruleset_id: string; name: string }): Promise<CharacterSheet> {
  return api.post('/characters', payload, key());
}

export function deleteCharacter(id: string): Promise<void> {
  return api.delete(`/characters/${id}`);
}
