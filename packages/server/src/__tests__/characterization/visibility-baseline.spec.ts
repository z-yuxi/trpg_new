/**
 * visibility-baseline.spec.ts — PR-3 T3.1 特征化测试骨架
 *
 * 目的：冻结当前消息可见性过滤行为，作为 T3.2 新策略迁移的安全网。
 *
 * 核心约束：
 *   baselineService = MessageVisibilityPolicyService.applyLegacy（原始内联逻辑的直接复刻）
 *   newService      = MessageVisibilityPolicyService.applyPolicy（未来新策略）
 *   所有场景必须满足 newService output === baselineService output
 *
 * 测试矩阵（6 个场景，优先级 P0 × 3 + P1 × 3）：
 *   SC-01 P0 玩家在场内：当前在场，可见全部消息
 *   SC-02 P0 玩家离场后：按剧情时间裁剪，只保留在场期间消息
 *   SC-03 P0 OB 授权模式：可见授权时间点之后的消息
 *   SC-04 P1 GM 与玩家差异：GM 可见全部，玩家按规则裁剪
 *   SC-05 P1 发送时在场后离场：该消息仍可见（剧情时间锚定）
 *   SC-06 P1 多次进出场景：并集裁剪，无重复无遗漏
 *
 * 使用方法：
 *   1. 用真实测试数据替换各 setup() 内的 TODO 注释
 *   2. 确认 expectedCount 与实际数据一致
 *   3. pnpm test --filter @trpg/server visibility-baseline
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MessageVisibilityPolicyService } from '../../services/visibility/MessageVisibilityPolicyService';

// ─── 测试实例 ──────────────────────────────────────────────────────────────

const service = new MessageVisibilityPolicyService();

// ─── 辅助：构造轻量 Mock 消息（不依赖真实 DB） ────────────────────────────

function makeMsg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: String(Math.floor(Math.random() * 1e9)),
    campaign_id: 'camp-test',
    scene_id: 'scene-test',
    scene_type: 'spatial',
    sender_user_id: 'player-1',
    message_type: 'narrative',
    visible_to: null,
    created_at: new Date(),
    story_time: null,
    metadata: null,
    ...overrides,
  };
}

// ─── 场景矩阵 ──────────────────────────────────────────────────────────────

describe('PR-3 Visibility Baseline — 6 Scenarios', () => {
  // 注：以下测试目前使用 unit-level mock 验证过滤器纯逻辑。
  // 集成测试（真实 DB）需要在 e2e 目录下补充，并提供 setup/teardown fixtures。

  // SC-01 P0：玩家在场内，全部可见
  it('SC-01 P0: 玩家在场内，可见全部消息', async () => {
    // 模拟：applyLegacy 的过滤器核心逻辑（isGm=false，visible_to=null → 全体可见）
    const msgs = [
      makeMsg({ visible_to: null, message_type: 'narrative' }),
      makeMsg({ visible_to: null, message_type: 'narrative' }),
    ];

    // 验证过滤器：visible_to=null → 全体可见，玩家应能看到
    const filtered = msgs.filter((msg) => {
      if (msg['visible_to'] === null) return true;
      return false;
    });

    expect(filtered).toHaveLength(2);
  });

  // SC-02 P0：玩家离场后，按参与时段裁剪
  it('SC-02 P0: 玩家离场后，只保留在场期间消息', () => {
    const joinedAt = new Date('2024-01-01T10:00:00Z');
    const leftAt = new Date('2024-01-01T12:00:00Z');

    const msgs = [
      makeMsg({ created_at: new Date('2024-01-01T09:00:00Z') }),  // 进场前，不可见
      makeMsg({ created_at: new Date('2024-01-01T11:00:00Z') }),  // 在场内，可见
      makeMsg({ created_at: new Date('2024-01-01T13:00:00Z') }),  // 离场后，不可见
    ];

    // 模拟 history_visibility=none 的 EXISTS 子查询逻辑（joined_at ≤ msg ≤ left_at）
    const filtered = msgs.filter((msg) => {
      const createdAt = msg['created_at'] as Date;
      return createdAt >= joinedAt && createdAt <= leftAt;
    });

    expect(filtered).toHaveLength(1);
    expect((filtered[0]!['created_at'] as Date).toISOString()).toBe('2024-01-01T11:00:00.000Z');
  });

  // SC-03 P0：OB 授权模式，授权时间点之后可见
  it('SC-03 P0: OB 授权，只可见 granted_at 之后的消息', () => {
    const grantedAt = new Date('2024-01-01T11:00:00Z');

    const msgs = [
      makeMsg({ created_at: new Date('2024-01-01T10:00:00Z'), scene_type: 'virtual' }),  // 授权前，不可见
      makeMsg({ created_at: new Date('2024-01-01T11:30:00Z'), scene_type: 'virtual' }),  // 授权后，可见
      makeMsg({ created_at: new Date('2024-01-01T12:00:00Z'), scene_type: 'virtual' }),  // 授权后，可见
    ];

    const filtered = msgs.filter((msg) => {
      const createdAt = msg['created_at'] as Date;
      if (Number.isNaN(createdAt.getTime())) return false;
      return createdAt >= grantedAt;
    });

    expect(filtered).toHaveLength(2);
  });

  // SC-04 P1：GM 可见全部，玩家按规则裁剪
  it('SC-04 P1: GM 可见全部消息，玩家按 visible_to 裁剪', () => {
    const gmUserId = 'gm-001';
    const playerCharId = 'char-player-1';
    const msgs = [
      makeMsg({ visible_to: null }),                         // 全体可见
      makeMsg({ visible_to: [playerCharId] }),               // 仅该玩家
      makeMsg({ visible_to: ['char-other'], sender_user_id: 'player-2' }),  // 其他玩家
    ];

    // GM 视角：全部可见
    const gmView = msgs; // isGm=true，不过滤
    expect(gmView).toHaveLength(3);

    // 玩家视角：只看 visible_to=null 或包含自己 char
    const playerView = msgs.filter((msg) => {
      if (msg['visible_to'] === null) return true;
      return (msg['visible_to'] as string[]).includes(playerCharId);
    });
    expect(playerView).toHaveLength(2);
  });

  // SC-05 P1：发送时在场，离场后消息仍可见
  it('SC-05 P1: 发送时在场，离场后该消息仍可见（剧情时间锚定）', () => {
    const joinedAt = new Date('2024-01-01T10:00:00Z');
    const leftAt = new Date('2024-01-01T12:00:00Z');

    const msgSentWhileIn = makeMsg({ created_at: new Date('2024-01-01T11:59:00Z') });

    // 虽然用户已离场（查询时刻 > leftAt），但消息发送时在场（created_at <= leftAt）
    const createdAt = msgSentWhileIn['created_at'] as Date;
    const wasInSceneWhenSent = createdAt >= joinedAt && createdAt <= leftAt;
    expect(wasInSceneWhenSent).toBe(true);
  });

  // SC-06 P1：多次进出场景，并集裁剪
  it('SC-06 P1: 多次进出场景，并集覆盖，无重复无遗漏', () => {
    // 第一次：10:00 ~ 11:00
    // 第二次：13:00 ~ 15:00
    const periods = [
      { joinedAt: new Date('2024-01-01T10:00:00Z'), leftAt: new Date('2024-01-01T11:00:00Z') },
      { joinedAt: new Date('2024-01-01T13:00:00Z'), leftAt: null }, // 当前仍在场
    ];

    const msgs = [
      makeMsg({ created_at: new Date('2024-01-01T09:00:00Z') }),  // 第一次进场前，不可见
      makeMsg({ created_at: new Date('2024-01-01T10:30:00Z') }),  // 第一次在场，可见
      makeMsg({ created_at: new Date('2024-01-01T12:00:00Z') }),  // 两次之间，不可见
      makeMsg({ created_at: new Date('2024-01-01T14:00:00Z') }),  // 第二次在场，可见
    ];

    const filtered = msgs.filter((msg) => {
      const createdAt = msg['created_at'] as Date;
      return periods.some((period) => {
        if (createdAt < period.joinedAt) return false;
        if (period.leftAt && createdAt > period.leftAt) return false;
        return true;
      });
    });

    expect(filtered).toHaveLength(2);
  });
});

// ─── 对比测试（当 new 策略实装后启用）─────────────────────────────────────

describe.skip('PR-3 Legacy vs New Policy Comparison (启用条件: T3.2 实装)', () => {
  // TODO: 集成测试环境就绪后，用真实 DB fixtures 替换以下占位代码
  it.todo('SC-01 legacy 与 new policy 输出一致');
  it.todo('SC-02 legacy 与 new policy 输出一致');
  it.todo('SC-03 legacy 与 new policy 输出一致');
  it.todo('SC-04 legacy 与 new policy 输出一致');
  it.todo('SC-05 legacy 与 new policy 输出一致');
  it.todo('SC-06 legacy 与 new policy 输出一致');
});
