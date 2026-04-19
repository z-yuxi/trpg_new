import { describe, it, expect } from 'vitest';
import { mergeRulesetGraphs } from '../../../shared/src/utils/ruleset-merger';

const node = (id: string, extra: object = {}) => ({ node_id: id, type: 'dice_roll', ...extra });

describe('mergeRulesetGraphs', () => {
  it('双方均未修改 — 保持原样', () => {
    const base = { atoms: [node('A'), node('B')], connections: [] };
    const ours = { atoms: [node('A'), node('B')], connections: [] };
    const theirs = { atoms: [node('A'), node('B')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.merged_graph.atoms).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);
  });

  it('theirs 新增节点 — 自动合并', () => {
    const base = { atoms: [node('A')], connections: [] };
    const ours = { atoms: [node('A')], connections: [] };
    const theirs = { atoms: [node('A'), node('C', { label: '新增' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    const ids = result.merged_graph.atoms.map((n: any) => n.node_id);
    expect(ids).toContain('A');
    expect(ids).toContain('C');
    expect(result.conflicts).toHaveLength(0);
  });

  it('ours 新增节点 — 自动合并', () => {
    const base = { atoms: [node('A')], connections: [] };
    const ours = { atoms: [node('A'), node('D', { label: '本地新增' })], connections: [] };
    const theirs = { atoms: [node('A')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    const ids = result.merged_graph.atoms.map((n: any) => n.node_id);
    expect(ids).toContain('A');
    expect(ids).toContain('D');
    expect(result.conflicts).toHaveLength(0);
  });

  it('只有 theirs 修改节点 — 接受 theirs', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'updated by parent' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect((result.merged_graph.atoms[0] as any).label).toBe('updated by parent');
    expect(result.conflicts).toHaveLength(0);
  });

  it('只有 ours 修改节点 — 保留 ours', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'local edit' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect((result.merged_graph.atoms[0] as any).label).toBe('local edit');
    expect(result.conflicts).toHaveLength(0);
  });

  it('双方都修改同一节点且内容不同 — 产生冲突，保留 ours', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'mine' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'theirs' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].node_id).toBe('A');
    expect(result.conflicts[0].type).toBe('modified_both');
    expect((result.merged_graph.atoms[0] as any).label).toBe('mine');
  });

  it('双方修改同一节点但结果相同 — 无冲突', () => {
    const base = { atoms: [node('A', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A', { label: 'same' })], connections: [] };
    const theirs = { atoms: [node('A', { label: 'same' })], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.conflicts).toHaveLength(0);
    expect((result.merged_graph.atoms[0] as any).label).toBe('same');
  });

  it('theirs 删除节点，ours 未修改 — 接受删除', () => {
    const base = { atoms: [node('A'), node('B')], connections: [] };
    const ours = { atoms: [node('A'), node('B')], connections: [] };
    const theirs = { atoms: [node('A')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    const ids = result.merged_graph.atoms.map((n: any) => n.node_id);
    expect(ids).not.toContain('B');
    expect(result.conflicts).toHaveLength(0);
  });

  it('theirs 删除节点，ours 修改了它 — 冲突，保留 ours', () => {
    const base = { atoms: [node('A'), node('B', { label: 'orig' })], connections: [] };
    const ours = { atoms: [node('A'), node('B', { label: 'edited' })], connections: [] };
    const theirs = { atoms: [node('A')], connections: [] };
    const result = mergeRulesetGraphs(base, ours, theirs);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].node_id).toBe('B');
    const ids = result.merged_graph.atoms.map((n: any) => n.node_id);
    expect(ids).toContain('B');
  });

  it('空图合并 — 返回空', () => {
    const empty = { atoms: [], connections: [] };
    const result = mergeRulesetGraphs(empty, empty, empty);
    expect(result.merged_graph.atoms).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });
});
