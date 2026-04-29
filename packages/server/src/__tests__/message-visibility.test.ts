/**
 * 消息可见性回归测试矩阵
 *
 * 覆盖矩阵（附录 C + T.1~T.4）：
 *
 * 维度一：场景类型
 *   ├── lobby（公共场）   → visible_to=null 全体可见
 *   ├── spatial（剧情场） → computeVisibleTo → 按当前在场角色
 *   └── virtual（私密场） → computeVisibleTo → 按参与记录 + OB 权限
 *
 * 维度二：消息类型
 *   ├── narrative / dice          → 按场景可见性
 *   ├── ooc / system / announcement → 全体可见
 *   └── visible_to=[]（空列表）   → 仅发件人 + GM
 *
 * 维度三：history_visibility 过滤（任务 1.2 EXISTS 子查询）
 *   ├── none   → 仅在场期间（joined_at ≤ msg ≤ left_at 或 left_at IS NULL）
 *   ├── recent → 最新 N 条
 *   └── all    → 不过滤
 *
 * 维度四：OB（旁观）权限
 *   ├── 未授权旁观者 → 无法看到 virtual 场私密消息
 *   └── 已授权且 granted_at ≤ msg.created_at → 可见
 */

import { describe, it, expect } from 'vitest';
import { MessageVisibilityFilter } from '../services/visibility';
import type { ChatMessage } from '@trpg/shared';

// ─────────────────────────────────────────────────────────────────────────────
// 辅助工厂
// ─────────────────────────────────────────────────────────────────────────────

function makeMsg(
  overrides: Partial<Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'>>
): Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'> {
  return {
    visible_to: null,
    message_type: 'narrative',
    sender_user_id: 'player-1',
    ...overrides,
  };
}

const GM = 'gm-001';
const PLAYER_1 = 'player-1';
const PLAYER_2 = 'player-2';
const PLAYER_3 = 'player-3';
const OUTSIDER = 'outsider-99';

// ─────────────────────────────────────────────────────────────────────────────
// 模块一：MessageVisibilityFilter.compute（T.2 五步过滤）
// ─────────────────────────────────────────────────────────────────────────────

describe('MessageVisibilityFilter.compute — T.2 五步过滤', () => {
  const participants = [PLAYER_1, PLAYER_2];

  // ── 步骤①：特殊类型全体可见 ─────────────────────────────────────────────
  describe('① system/announcement → 全体可见', () => {
    it('system 消息对所有在场参与者和 GM 可见', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ message_type: 'system', visible_to: null }),
        participants,
        GM,
      );
      expect(result).toContain(PLAYER_1);
      expect(result).toContain(PLAYER_2);
      expect(result).toContain(GM);
    });

    it('announcement 消息对所有在场参与者和 GM 可见', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ message_type: 'announcement', visible_to: null }),
        participants,
        GM,
      );
      expect(result).toContain(PLAYER_1);
      expect(result).toContain(PLAYER_2);
      expect(result).toContain(GM);
    });

    it('system 消息在空场景（无参与者）时仍包含 GM', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ message_type: 'system', visible_to: [] }),
        [],
        GM,
      );
      expect(result).toContain(GM);
    });
  });

  // ── 步骤②：visible_to=[] → 仅发件人 + GM ────────────────────────────────
  describe('② visible_to=[] → 仅发件人 + GM', () => {
    it('空列表消息仅发件人和 GM 可见', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ message_type: 'dice', visible_to: [], sender_user_id: PLAYER_1 }),
        [PLAYER_1, PLAYER_2],
        GM,
      );
      expect(result).toContain(PLAYER_1);
      expect(result).toContain(GM);
      expect(result).not.toContain(PLAYER_2);
      expect(result).not.toContain(OUTSIDER);
    });

    it('GM 自己发送的空列表消息仅 GM 可见（无重复）', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ message_type: 'dice', visible_to: [], sender_user_id: GM }),
        [PLAYER_1],
        GM,
      );
      expect(result).toEqual([GM]);
    });
  });

  // ── 步骤③：visible_to=null → 全体可见 ──────────────────────────────────
  describe('③ visible_to=null → 全体可见（在场+GM）', () => {
    it('narrative 消息 visible_to=null 时对所有在场参与者和 GM 可见', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ message_type: 'narrative', visible_to: null }),
        [PLAYER_1, PLAYER_2, PLAYER_3],
        GM,
      );
      expect(result).toContain(PLAYER_1);
      expect(result).toContain(PLAYER_2);
      expect(result).toContain(PLAYER_3);
      expect(result).toContain(GM);
    });

    it('空场景（无在场玩家）时 null 消息仅 GM 可见', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ message_type: 'narrative', visible_to: null }),
        [],
        GM,
      );
      expect(result).toContain(GM);
      expect(result).not.toContain(PLAYER_1);
    });
  });

  // ── 步骤④+⑤：visible_to 有值 + GM 始终注入 ─────────────────────────────
  describe('④ visible_to 有值 → 按列表过滤；⑤ GM 始终注入', () => {
    it('指定 character ID 列表时仅对应用户可见', () => {
      const charId1 = 'char-001';
      const charId2 = 'char-002';
      const result = MessageVisibilityFilter.compute(
        makeMsg({ visible_to: [charId1], sender_user_id: PLAYER_1 }),
        [PLAYER_1, PLAYER_2],
        GM,
      );
      expect(result).toContain(charId1);
      expect(result).toContain(GM);   // ⑤ GM 始终注入
      expect(result).not.toContain(charId2);
      expect(result).not.toContain(PLAYER_2);
    });

    it('GM 不在 visible_to 列表时也应被注入', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ visible_to: [PLAYER_1], sender_user_id: PLAYER_1 }),
        [PLAYER_1, PLAYER_2],
        GM,
      );
      expect(result).toContain(GM);
    });

    it('visible_to 包含 GM 时结果无重复', () => {
      const result = MessageVisibilityFilter.compute(
        makeMsg({ visible_to: [GM, PLAYER_1] }),
        [PLAYER_1],
        GM,
      );
      const gmCount = result.filter((id) => id === GM).length;
      expect(gmCount).toBe(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 模块二：history_visibility 时段过滤逻辑验证（纯逻辑，不依赖 DB）
// ─────────────────────────────────────────────────────────────────────────────

describe('history_visibility 时段过滤逻辑（EXISTS 等价测试）', () => {
  /** 模拟 EXISTS 子查询：判断消息 msgTime 是否在某次参与区间内 */
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

  const T = (offset: number) => new Date(1_700_000_000_000 + offset * 1000);

  // ── none 模式：多次进出的分段可见 ────────────────────────────────────────
  describe('none — 按参与时段过滤', () => {
    it('首次加入后的消息可见', () => {
      const parts = [{ joined_at: T(10), left_at: null }];
      expect(isInParticipationWindow(parts, T(20))).toBe(true);
    });

    it('加入前的消息不可见', () => {
      const parts = [{ joined_at: T(10), left_at: null }];
      expect(isInParticipationWindow(parts, T(5))).toBe(false);
    });

    it('离开后的消息不可见', () => {
      const parts = [{ joined_at: T(10), left_at: T(20) }];
      expect(isInParticipationWindow(parts, T(25))).toBe(false);
    });

    it('在场期间的消息可见（边界：joined_at 时刻）', () => {
      const parts = [{ joined_at: T(10), left_at: T(20) }];
      expect(isInParticipationWindow(parts, T(10))).toBe(true);
    });

    it('在场期间的消息可见（边界：left_at 时刻）', () => {
      const parts = [{ joined_at: T(10), left_at: T(20) }];
      expect(isInParticipationWindow(parts, T(20))).toBe(true);
    });

    it('多次进出：离开期间的消息不可见', () => {
      // 进出两次：[10,20] 和 [30, null]
      const parts = [
        { joined_at: T(10), left_at: T(20) },
        { joined_at: T(30), left_at: null },
      ];
      expect(isInParticipationWindow(parts, T(25))).toBe(false);
    });

    it('多次进出：第二次在场期间的消息可见', () => {
      const parts = [
        { joined_at: T(10), left_at: T(20) },
        { joined_at: T(30), left_at: null },
      ];
      expect(isInParticipationWindow(parts, T(40))).toBe(true);
    });

    it('无参与记录时任何消息均不可见', () => {
      expect(isInParticipationWindow([], T(100))).toBe(false);
    });
  });

  // ── recent 模式：只需保证查询返回最近 N 条（此处仅断言排序逻辑）────────
  describe('recent — 最近 N 条排序验证', () => {
    it('按 id DESC 排序后 reverse 等价于 id ASC 的最后 N 条', () => {
      const messages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const limit = 3;
      const recentDesc = messages.slice().reverse().slice(0, limit); // [10,9,8]
      recentDesc.reverse(); // [8,9,10]
      expect(recentDesc).toEqual([8, 9, 10]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 模块三：OB（旁观）权限时间窗口验证
// ─────────────────────────────────────────────────────────────────────────────

describe('OB 旁观权限时间窗口', () => {
  const T = (offset: number) => new Date(1_700_000_000_000 + offset * 1000);

  /** 模拟 OB 权限校验：granted_at 之后的消息可见 */
  function isObVisible(
    obGrants: Array<{ granted_at: Date; revoked_at: Date | null }>,
    msgTime: Date,
  ): boolean {
    return obGrants.some(
      (g) =>
        g.granted_at <= msgTime &&
        (g.revoked_at === null || g.revoked_at > msgTime),
    );
  }

  it('授权前的消息对旁观者不可见', () => {
    const grants = [{ granted_at: T(100), revoked_at: null }];
    expect(isObVisible(grants, T(50))).toBe(false);
  });

  it('授权后的消息对旁观者可见', () => {
    const grants = [{ granted_at: T(100), revoked_at: null }];
    expect(isObVisible(grants, T(200))).toBe(true);
  });

  it('OB 授权被撤销后的消息不可见', () => {
    const grants = [{ granted_at: T(100), revoked_at: T(200) }];
    expect(isObVisible(grants, T(250))).toBe(false);
  });

  it('OB 授权撤销前的消息仍可见', () => {
    const grants = [{ granted_at: T(100), revoked_at: T(200) }];
    expect(isObVisible(grants, T(150))).toBe(true);
  });

  it('无 OB 授权记录时对外部用户不可见', () => {
    expect(isObVisible([], T(100))).toBe(false);
  });

  it('多次 OB 授权：第二次授权范围内可见', () => {
    const grants = [
      { granted_at: T(10), revoked_at: T(50) },
      { granted_at: T(100), revoked_at: null },
    ];
    expect(isObVisible(grants, T(200))).toBe(true);
    expect(isObVisible(grants, T(70))).toBe(false); // 两次授权间隙
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 模块四：场景类型 × 消息类型 全矩阵
// ─────────────────────────────────────────────────────────────────────────────

describe('场景类型 × 消息类型 可见性矩阵', () => {
  /**
   * 模拟消息路由层的场景可见性判断（客户端过滤逻辑等价验证）
   *
   * 规则：
   *   1. GM 永远可见
   *   2. system/announcement → 全体
   *   3. visible_to=null → 全体在场
   *   4. visible_to=[]   → 仅发件人 + GM
   *   5. visible_to=[ids] → 列表内 + GM
   */
  function canSee(
    userId: string,
    msg: Pick<ChatMessage, 'visible_to' | 'message_type' | 'sender_user_id'>,
    sceneParticipantIds: string[],
    gmId: string,
  ): boolean {
    const visible = MessageVisibilityFilter.compute(msg, sceneParticipantIds, gmId);
    return visible.includes(userId);
  }

  // 公共场（lobby）：visible_to=null，所有消息全体可见
  describe('公共场（lobby）— narrative 全体可见', () => {
    const lobbyParticipants = [PLAYER_1, PLAYER_2, PLAYER_3];

    it('所有在场玩家均可见', () => {
      const msg = makeMsg({ message_type: 'narrative', visible_to: null });
      for (const p of lobbyParticipants) {
        expect(canSee(p, msg, lobbyParticipants, GM)).toBe(true);
      }
    });

    it('GM 在 lobby 消息中可见', () => {
      const msg = makeMsg({ message_type: 'narrative', visible_to: null });
      expect(canSee(GM, msg, lobbyParticipants, GM)).toBe(true);
    });

    it('未在场的外部用户不可见（lobby 无旁观者加入）', () => {
      const msg = makeMsg({ message_type: 'narrative', visible_to: null });
      expect(canSee(OUTSIDER, msg, lobbyParticipants, GM)).toBe(false);
    });
  });

  // 剧情场（spatial）：visible_to = 在场角色 ID 列表
  describe('剧情场（spatial）— 按当前在场角色', () => {
    const charId1 = 'char-p1';
    const charId2 = 'char-p2';
    const spatialVisible = [charId1, charId2];

    it('在场角色 ID 在 visible_to 时对对应用户可见', () => {
      const msg = makeMsg({ visible_to: spatialVisible });
      expect(canSee(charId1, msg, spatialVisible, GM)).toBe(true);
      expect(canSee(charId2, msg, spatialVisible, GM)).toBe(true);
    });

    it('不在场角色对私密剧情消息不可见', () => {
      const charId3 = 'char-p3';
      const msg = makeMsg({ visible_to: [charId1] });
      expect(canSee(charId3, msg, [charId1, charId2], GM)).toBe(false);
    });

    it('GM 始终对剧情场消息可见', () => {
      const msg = makeMsg({ visible_to: [charId1] });
      expect(canSee(GM, msg, [charId1], GM)).toBe(true);
    });
  });

  // 私密场（virtual）：visible_to = 参与者 ID 列表
  describe('私密场（virtual）— 按参与者', () => {
    it('参与者可见私密场消息', () => {
      const msg = makeMsg({ visible_to: [PLAYER_1, PLAYER_2] });
      expect(canSee(PLAYER_1, msg, [PLAYER_1, PLAYER_2], GM)).toBe(true);
    });

    it('非参与者不可见私密场消息', () => {
      const msg = makeMsg({ visible_to: [PLAYER_1] });
      expect(canSee(PLAYER_3, msg, [PLAYER_1, PLAYER_2], GM)).toBe(false);
    });

    it('私密场 ooc 消息全体可见（ooc 不受 visible_to 控制）', () => {
      // ooc 消息 visible_to 由上层设为 null
      const msg = makeMsg({ message_type: 'ooc', visible_to: null });
      const allParticipants = [PLAYER_1, PLAYER_2, PLAYER_3];
      for (const p of allParticipants) {
        expect(canSee(p, msg, allParticipants, GM)).toBe(true);
      }
    });
  });

  // 跨场景：system 消息始终全体可见
  describe('system/announcement — 不区分场景类型，全体可见', () => {
    const cases: Array<{ name: string; sceneParticipants: string[] }> = [
      { name: 'lobby', sceneParticipants: [PLAYER_1, PLAYER_2] },
      { name: 'spatial', sceneParticipants: [PLAYER_1] },
      { name: 'virtual（空）', sceneParticipants: [] },
    ];

    for (const c of cases) {
      it(`${c.name} 场景的 system 消息 GM 可见`, () => {
        const msg = makeMsg({ message_type: 'system', visible_to: null });
        expect(canSee(GM, msg, c.sceneParticipants, GM)).toBe(true);
      });
    }
  });

  // 边界：visible_to 包含 '*' 通配符
  describe('visible_to 包含 * 通配符', () => {
    it('* 在 visible_to 列表内时包含所有通配用户', () => {
      // 通配符 '*' 由客户端查询层特殊处理，MessageVisibilityFilter 直接透传
      const msg = makeMsg({ visible_to: ['*'] });
      const result = MessageVisibilityFilter.compute(msg, [PLAYER_1], GM);
      expect(result).toContain('*');
      expect(result).toContain(GM); // GM 始终注入
    });
  });
});
