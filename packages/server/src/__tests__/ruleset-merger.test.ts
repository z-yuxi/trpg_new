import { describe, it, expect } from 'vitest';
import { mergeRulesetGraphs } from '@trpg/shared';

const node = (id: string, extra: object = {}) => ({ node_id: id, type: 'dice_roll', ...extra });

describe('mergeRulesetGraphs', () => {
  it('both unchanged keeps base', () => {
    const base = { atoms: [node('A'), node('B')], connections: [] };
    const ours = { atoms: [node('A'), node('B')], connections: [] };
    const theirs = { atoms: [node('A'), node('B')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.merged_graph!.atoms).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it('theirs added node merges automatically', () => {
    const base = { atoms: [node('A')], connections: [] };
    const ours = { atoms: [node('A')], connections: [] };
    const theirs = { atoms: [node('A'), node('C', { label: 'added' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    const ids = result.merged_graph!.atoms.map((n: any) => n.node_id);
    expect(ids).toContain('A');
    expect(ids).toContain('C');
    expect(result.conflicts).toHaveLength(0);
  });

  it('ours added node merges automatically', () => {
    const base = { atoms: [node('A')], connections: [] };
    const ours = { atoms: [node('A'), node('D', { label: 'local added' })], connections: [] };
    const theirs = { atoms: [node('A')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    const ids = result.merged_graph!.atoms.map((n: any) => n.node_id);
    expect(ids).toContain('A');
    expect(ids).toContain('D');
    expect(result.conflicts).toHaveLength(0);
  });

  it('only theirs modifies node', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'updated by parent' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect((result.merged_graph!.atoms[0] as any).label).toBe('updated by parent');
    expect(result.conflicts).toHaveLength(0);
  });

  it('only ours modifies node', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'local edit' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect((result.merged_graph!.atoms[0] as any).label).toBe('local edit');
    expect(result.conflicts).toHaveLength(0);
  });

  it('both modify same node differently creates conflict and keeps ours', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'mine' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'theirs' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].node_id).toBe('A');
    expect(result.conflicts[0].type).toBe('modified_both');
    expect((result.merged_graph!.atoms[0] as any).label).toBe('mine');
  });

  it('both modify same node to same value has no conflict', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'same' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'same' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.conflicts).toHaveLength(0);
    expect((result.merged_graph!.atoms[0] as any).label).toBe('same');
  });

  it('theirs deletes node while ours unchanged accepts delete', () => {
    const base = { atoms: [node('A'), node('B')], connections: [] };
    const ours = { atoms: [node('A'), node('B')], connections: [] };
    const theirs = { atoms: [node('A')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    const ids = result.merged_graph!.atoms.map((n: any) => n.node_id);
    expect(ids).not.toContain('B');
    expect(result.conflicts).toHaveLength(0);
  });

  it('theirs deletes node while ours modifies keeps ours with conflict', () => {
    const base = { atoms: [node('A'), node('B', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A'), node('B', { label: 'edited' })], connections: [] };
    const theirs = { atoms: [node('A')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].node_id).toBe('B');
    const ids = result.merged_graph!.atoms.map((n: any) => n.node_id);
    expect(ids).toContain('B');
  });

  it('empty graph merge returns empty', () => {
    const empty = { atoms: [], connections: [] };
    const result = mergeRulesetGraphs(empty, empty, empty);
    expect(result.merged_graph!.atoms).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });
});
