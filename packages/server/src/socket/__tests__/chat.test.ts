import { describe, it, expect } from 'vitest';
import { SnowflakeGenerator } from '@trpg/shared';
import { computeVisibility } from '../../services/visibility';

describe('SnowflakeGenerator', () => {
  it('应生成唯一 ID（1000个）', () => {
    const gen = new SnowflakeGenerator(1);
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(gen.nextId());
    }
    expect(ids.size).toBe(1000);
  });

  it('ID 应单调递增', () => {
    const gen = new SnowflakeGenerator(2);
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(gen.nextId());
    }
    for (let i = 1; i < ids.length; i++) {
      expect(SnowflakeGenerator.compare(ids[i], ids[i - 1])).toBeGreaterThan(0);
    }
  });

  it('应能从 ID 中提取时间戳', () => {
    const gen = new SnowflakeGenerator(3);
    const before = new Date();
    const id = gen.nextId();
    const after = new Date();
    const extracted = SnowflakeGenerator.extractTimestamp(id);
    expect(extracted.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1);
    expect(extracted.getTime()).toBeLessThanOrEqual(after.getTime() + 1);
  });

  it('compare() 应正确比较大小', () => {
    const gen = new SnowflakeGenerator(4);
    const a = gen.nextId();
    const b = gen.nextId();
    expect(SnowflakeGenerator.compare(a, b)).toBeLessThan(0);
    expect(SnowflakeGenerator.compare(b, a)).toBeGreaterThan(0);
    expect(SnowflakeGenerator.compare(a, a)).toBe(0);
  });
});

describe('computeVisibility', () => {
  const participants = ['user1', 'user2', 'user3'];
  const gm = 'gm_user';

  it('visible_to 为 null → 返回场内所有人（含GM）', () => {
    const result = computeVisibility(
      { visible_to: null, message_type: 'narrative', sender_user_id: 'user1' },
      participants,
      gm
    );
    expect(result).toContain('user1');
    expect(result).toContain('user2');
    expect(result).toContain('user3');
    expect(result).toContain('gm_user');
  });

  it('visible_to 指定用户列表 → 只返回指定用户 + GM', () => {
    const result = computeVisibility(
      { visible_to: ['user1', 'user2'], message_type: 'narrative', sender_user_id: 'user1' },
      participants,
      gm
    );
    expect(result).toContain('user1');
    expect(result).toContain('user2');
    expect(result).toContain('gm_user');
    expect(result).not.toContain('user3');
  });

  it('system 消息始终返回所有人', () => {
    const result = computeVisibility(
      { visible_to: ['user1'], message_type: 'system', sender_user_id: 'system' },
      participants,
      gm
    );
    expect(result).toContain('user1');
    expect(result).toContain('user2');
    expect(result).toContain('user3');
    expect(result).toContain('gm_user');
  });

  it('announcement 消息始终返回所有人', () => {
    const result = computeVisibility(
      { visible_to: null, message_type: 'announcement', sender_user_id: 'gm_user' },
      participants,
      gm
    );
    expect(result).toContain('user1');
    expect(result).toContain('gm_user');
  });

  it('GM 始终在可见列表中', () => {
    const result = computeVisibility(
      { visible_to: ['user1'], message_type: 'ooc', sender_user_id: 'user1' },
      participants,
      gm
    );
    expect(result).toContain('gm_user');
  });
});
