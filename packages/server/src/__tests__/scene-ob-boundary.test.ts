/**
 * 场景权限边界测试 — 高风险边界场景
 *
 * 补充 message-visibility.test.ts 中已有主流程之外的边界情况：
 *
 * 模块一：OB 权限撤销后再次授予（双时间窗口）
 * 模块二：玩家多次进出同一场景（多段参与窗口）
 * 模块三：OB 授权与场景参与权限 OR 逻辑（成为正式参与者后不依赖 OB）
 * 模块四：精确时间戳边界（inclusive/exclusive 语义）
 */

import { describe, it, expect } from 'vitest';
import { MessageVisibilityFilter } from '../services/visibility';
import type { ChatMessage } from '@trpg/shared';

// ─────────────────────────────────────────────────────────────────────────────
// 辅助工厂 & 共享常量
// ─────────────────────────────────────────────────────────────────────────────

function makeMsg(
  overrides: Partial<Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'>>
): Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'> {
  return { visible_to: null, message_type: 'narrative', sender_user_id: 'player-1', ...overrides };
}

const T = (offsetSec: number) => new Date(1_720_000_000_000 + offsetSec * 1000);

const GM      = 'gm-boundary-001';
const OB_USER = 'ob-boundary-001';
const PLAYER  = 'player-boundary-001';
const PLAYER2 = 'player-boundary-002';

// ─── 纯逻辑辅助：判断消息在 OB 窗口组内是否可见 ───────────────────────────

/** 模拟数据库中 scene_ob_permissions 的时段可见性逻辑 */
function isInObWindow(
  obGrants: Array<{ granted_at: Date; revoked_at: Date | null }>,
  msgTime: Date,
): boolean {
  return obGrants.some(
    (g) =>
      g.granted_at <= msgTime &&
      (g.revoked_at === null || g.revoked_at >= msgTime),
  );
}

/** 模拟 scene_participations 的时段可见性逻辑（none 模式） */
function isInParticipationWindow(
  participations: Array<{ joined_at: Date; left_at: Date | null }>,
  msgTime: Date,
): boolean {
  return participations.some(
    (p) =>
      p.joined_at <= msgTime &&
      (p.left_at === null || p.left_at >= msgTime),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 模块一：OB 权限撤销后再次授予（双时间窗口）
// ─────────────────────────────────────────────────────────────────────────────

describe('OB 权限 — 撤销后再次授予（双时间窗口）', () => {
  // 授权窗口：[T(5)~T(20)]（撤销）; [T(40)~∞]（重新授权）
  const obGrants = [
    { granted_at: T(5),  revoked_at: T(20) },
    { granted_at: T(40), revoked_at: null  },
  ];

  it('第一窗口内（granted_at ≤ msg ≤ revoked_at）— 可见', () => {
    expect(isInObWindow(obGrants, T(10))).toBe(true);
    expect(isInObWindow(obGrants, T(15))).toBe(true);
  });

  it('第一窗口边界：精确在 granted_at — 可见（含边界）', () => {
    expect(isInObWindow(obGrants, T(5))).toBe(true);
  });

  it('第一窗口边界：精确在 revoked_at — 可见（含边界，撤销动作本身当刻消息仍可见）', () => {
    expect(isInObWindow(obGrants, T(20))).toBe(true);
  });

  it('两个窗口之间（revoked 后 re-grant 前）— 不可见', () => {
    expect(isInObWindow(obGrants, T(21))).toBe(false);
    expect(isInObWindow(obGrants, T(30))).toBe(false);
    expect(isInObWindow(obGrants, T(39))).toBe(false);
  });

  it('第二窗口边界：精确在 re-granted_at — 可见', () => {
    expect(isInObWindow(obGrants, T(40))).toBe(true);
  });

  it('第二窗口内（re-grant 后，无截止）— 可见', () => {
    expect(isInObWindow(obGrants, T(50))).toBe(true);
    expect(isInObWindow(obGrants, T(100))).toBe(true);
  });

  it('授权前 — 不可见', () => {
    expect(isInObWindow(obGrants, T(0))).toBe(false);
    expect(isInObWindow(obGrants, T(4))).toBe(false);
  });

  it('空授权列表 — 任何消息不可见', () => {
    expect(isInObWindow([], T(10))).toBe(false);
    expect(isInObWindow([], T(0))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 模块二：玩家多次进出同一场景（多段参与窗口）
// ─────────────────────────────────────────────────────────────────────────────

describe('玩家多次进出场景 — 多段参与窗口历史可见性', () => {
  // 第一次在场：[T(10)~T(30)]；第二次在场：[T(50)~∞]
  const participations = [
    { joined_at: T(10), left_at: T(30)  },
    { joined_at: T(50), left_at: null   },
  ];

  it('加入前 — 不可见', () => {
    expect(isInParticipationWindow(participations, T(0))).toBe(false);
    expect(isInParticipationWindow(participations, T(9))).toBe(false);
  });

  it('第一次在场期间 — 可见', () => {
    expect(isInParticipationWindow(participations, T(10))).toBe(true);
    expect(isInParticipationWindow(participations, T(20))).toBe(true);
    expect(isInParticipationWindow(participations, T(30))).toBe(true);
  });

  it('两次在场之间（已离开、尚未返回）— 不可见', () => {
    expect(isInParticipationWindow(participations, T(31))).toBe(false);
    expect(isInParticipationWindow(participations, T(40))).toBe(false);
    expect(isInParticipationWindow(participations, T(49))).toBe(false);
  });

  it('第二次在场期间（至今未离开）— 可见', () => {
    expect(isInParticipationWindow(participations, T(50))).toBe(true);
    expect(isInParticipationWindow(participations, T(99))).toBe(true);
  });

  it('三进三出：中间缺口均不可见', () => {
    const threeWindows = [
      { joined_at: T(5),  left_at: T(15) },
      { joined_at: T(25), left_at: T(35) },
      { joined_at: T(45), left_at: T(55) },
    ];
    // 三个可见窗口
    expect(isInParticipationWindow(threeWindows, T(10))).toBe(true);
    expect(isInParticipationWindow(threeWindows, T(30))).toBe(true);
    expect(isInParticipationWindow(threeWindows, T(50))).toBe(true);
    // 三个不可见缺口
    expect(isInParticipationWindow(threeWindows, T(20))).toBe(false);
    expect(isInParticipationWindow(threeWindows, T(40))).toBe(false);
    expect(isInParticipationWindow(threeWindows, T(60))).toBe(false);
  });

  it('无参与记录 — 任何消息不可见', () => {
    expect(isInParticipationWindow([], T(10))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 模块三：OB 权限与参与者权限 OR 逻辑
// ─────────────────────────────────────────────────────────────────────────────

describe('OB 权限与参与者权限 OR 逻辑', () => {
  /**
   * 情景：用户先以 OB 旁观，后通过 formGroup 正式成为参与者。
   * OB 授权在 T(5)，T(20) 撤销（成团后不再需要 OB）；
   * 正式参与 joined_at = T(20)（同时撤销 OB，加入 scene_participations）。
   */
  const obGrants      = [{ granted_at: T(5), revoked_at: T(20) }];
  const participations = [{ joined_at: T(20), left_at: null }];

  function isVisible(msgTime: Date): boolean {
    return isInObWindow(obGrants, msgTime) || isInParticipationWindow(participations, msgTime);
  }

  it('OB 窗口内（T(5)~T(19)）— OB 授权生效', () => {
    expect(isVisible(T(5))).toBe(true);
    expect(isVisible(T(10))).toBe(true);
    expect(isVisible(T(19))).toBe(true);
  });

  it('OB 撤销 + 参与开始的精确时刻 T(20) — 两条路径均覆盖，可见', () => {
    // OB 在 revoked_at 时仍含边界，参与从 joined_at 开始
    expect(isVisible(T(20))).toBe(true);
  });

  it('OB 撤销后作为正式参与者（T(21) 起）— 参与权限持续生效', () => {
    expect(isVisible(T(21))).toBe(true);
    expect(isVisible(T(50))).toBe(true);
  });

  it('完全在 OB 和参与窗口之前 — 不可见', () => {
    expect(isVisible(T(0))).toBe(false);
    expect(isVisible(T(4))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 模块四：MessageVisibilityFilter 与 OB 权限结合（集成验证）
// ─────────────────────────────────────────────────────────────────────────────

describe('MessageVisibilityFilter 与 OB 旁观权限集成', () => {
  /**
   * 场景：virtual 场景
   * - OB_USER 只有 OB 授权（不在 sceneParticipantUserIds 中）
   * - 消息 visible_to 已由 computeVisibleTo 预先写入（包含 OB_USER）
   * - 验证 compute() 能正确保留 OB_USER
   */

  it('OB 用户在 visible_to 列表中时应可见（compute 逐列表过滤）', () => {
    const result = MessageVisibilityFilter.compute(
      makeMsg({ visible_to: [PLAYER, OB_USER] }),
      [PLAYER, PLAYER2],
      GM,
    );
    expect(result).toContain(OB_USER);
    expect(result).toContain(PLAYER);
    expect(result).toContain(GM);
    expect(result).not.toContain(PLAYER2); // 不在 visible_to 中的其他玩家排除
  });

  it('OB 用户 OB 被撤销后从 visible_to 移除 → compute 不含 OB_USER', () => {
    // 撤销后 computeVisibleTo 不再把 OB_USER 放入 visible_to
    const result = MessageVisibilityFilter.compute(
      makeMsg({ visible_to: [PLAYER] }), // OB_USER 已被移除
      [PLAYER, PLAYER2],
      GM,
    );
    expect(result).not.toContain(OB_USER);
    expect(result).toContain(PLAYER);
    expect(result).toContain(GM);
  });

  it('OB 用户在 visible_to=null 广播消息中也可见（全体可见分支）', () => {
    // visible_to=null → 全体在场参与者 + GM 可见
    // OB 用户已被加入 sceneParticipantUserIds（由 computeVisibleTo 返回）
    const result = MessageVisibilityFilter.compute(
      makeMsg({ visible_to: null }),
      [PLAYER, PLAYER2, OB_USER], // OB_USER 已在参与者列表
      GM,
    );
    expect(result).toContain(OB_USER);
    expect(result).toContain(PLAYER);
    expect(result).toContain(GM);
  });

  it('OB 被撤销后从参与者列表移除 → visible_to=null 消息不含 OB_USER', () => {
    const result = MessageVisibilityFilter.compute(
      makeMsg({ visible_to: null }),
      [PLAYER, PLAYER2], // OB_USER 已从列表移除
      GM,
    );
    expect(result).not.toContain(OB_USER);
    expect(result).toContain(PLAYER);
    expect(result).toContain(GM);
  });
});
