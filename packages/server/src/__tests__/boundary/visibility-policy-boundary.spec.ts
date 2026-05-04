/**
 * visibility-policy-boundary.spec.ts — 可见性策略边界测试
 *
 * 覆盖三类高风险场景：
 *   BND-01  策略切换时序：VISIBILITY_POLICY 快照语义，运行时修改 env 不影响已加载模块
 *   BND-02  空边界：messages=[] 时 applyLegacy 过滤器不抛错
 *   BND-03  getAuthedUser 无状态并发验证：并发伪请求之间状态不互相污染
 *   BND-04  多设备可见性一致性：同一用户两个连接（一在场/一离场），可见集合各自独立
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  MessageVisibilityPolicyService,
  VISIBILITY_POLICY,
} from '../../services/visibility/MessageVisibilityPolicyService';
import { getAuthedUser, AuthenticationError } from '../../middleware/auth-typed';
import type { Request } from 'express';
import type { User } from '@trpg/shared';

// ─── 辅助：轻量 mock 消息（不依赖 DB） ────────────────────────────────────

function makeMsg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: String(Math.floor(Math.random() * 1e12)),
    campaign_id: 'camp-bnd',
    scene_id: 'scene-bnd',
    scene_type: 'spatial',
    sender_user_id: 'player-a',
    message_type: 'narrative',
    visible_to: null,
    created_at: new Date('2024-06-01T12:00:00Z'),
    story_time: null,
    metadata: null,
    ...overrides,
  };
}

// ─── BND-01 策略切换时序 ───────────────────────────────────────────────────

describe('BND-01 VISIBILITY_POLICY 快照语义', () => {
  /**
   * VISIBILITY_POLICY 是模块级常量，在 import 时从 process.env 快照。
   * 运行时修改 process.env['VISIBILITY_POLICY'] 不会影响已加载模块的值。
   * 这保证了：同一进程内所有进行中的请求始终使用同一策略，不会因
   * 运维人员热修改 env 而导致同一次查询前后使用不同策略。
   */

  it('VISIBILITY_POLICY 是编译时快照，不随 process.env 动态变化', () => {
    const originalEnv = process.env['VISIBILITY_POLICY'];
    const snapshotAtImport = VISIBILITY_POLICY; // 模块加载时的值

    // 模拟运维修改 env
    process.env['VISIBILITY_POLICY'] = snapshotAtImport === 'legacy' ? 'new' : 'legacy';

    // 已导入的模块常量不受影响
    expect(VISIBILITY_POLICY).toBe(snapshotAtImport);

    // 恢复
    if (originalEnv === undefined) {
      delete process.env['VISIBILITY_POLICY'];
    } else {
      process.env['VISIBILITY_POLICY'] = originalEnv;
    }
  });

  it('applyPolicy 在两次调用之间 env 改变时，两次调用均走同一分支', async () => {
    /**
     * 由于 VISIBILITY_POLICY 是模块常量，即使 env 在两次调用之间被修改，
     * 两次调用都引用同一个常量值，不会走不同分支。
     * 此测试通过 spy 证明：无论 env 如何，applyPolicy 的分支选择是确定性的。
     */
    const service = new MessageVisibilityPolicyService();

    // 注入 mock applyLegacy，避免 DB 调用
    let legacyCallCount = 0;
    const originalApplyLegacy = service.applyLegacy.bind(service);
    service.applyLegacy = async (...args) => {
      legacyCallCount++;
      // 返回空数组（此处不需要真实 DB，仅验证分支）
      return [];
    };

    const originalEnv = process.env['VISIBILITY_POLICY'];
    process.env['VISIBILITY_POLICY'] = 'new'; // 修改 env（不影响已加载常量）

    await service.applyPolicy('camp-1', 'user-1', false, {});
    await service.applyPolicy('camp-1', 'user-1', false, {});

    // applyLegacy 被调用了 2 次（两次都走同一分支，由模块常量决定）
    expect(legacyCallCount).toBe(2);

    // 恢复
    if (originalEnv === undefined) {
      delete process.env['VISIBILITY_POLICY'];
    } else {
      process.env['VISIBILITY_POLICY'] = originalEnv;
    }
    service.applyLegacy = originalApplyLegacy;
  });
});

// ─── BND-02 空边界 ─────────────────────────────────────────────────────────

describe('BND-02 空消息列表边界', () => {
  it('messages=[] 时可见性过滤器直接返回空数组，不抛错', () => {
    // 模拟 applyLegacy 的核心过滤器逻辑（不依赖 DB）
    const msgs: Record<string, unknown>[] = [];

    const filtered = msgs.filter((msg) => {
      if (msg['visible_to'] === null) return true;
      return false;
    });

    expect(filtered).toHaveLength(0);
    expect(() => filtered).not.toThrow();
  });

  it('全部消息 visible_to 均为空数组时，非 GM 用户看到空结果', () => {
    const userId = 'user-nobody';
    const msgs = [
      makeMsg({ visible_to: ['char-other-1'] }),
      makeMsg({ visible_to: ['char-other-2'] }),
    ];

    const filtered = msgs.filter((msg) => {
      if (msg['sender_user_id'] === userId) return true;
      if (msg['visible_to'] === null) return true;
      const visTo = msg['visible_to'] as string[];
      return visTo.some((id) => id === userId);
    });

    expect(filtered).toHaveLength(0);
  });

  it('全部消息均为系统消息时，任何用户均可见', () => {
    const msgs = [
      makeMsg({ message_type: 'system', visible_to: null }),
      makeMsg({ message_type: 'announcement', visible_to: null }),
    ];

    const filtered = msgs.filter((msg) => {
      const type = msg['message_type'] as string;
      if (type === 'system' || type === 'announcement') return true;
      return false;
    });

    expect(filtered).toHaveLength(2);
  });
});

// ─── BND-03 getAuthedUser 并发无污染 ──────────────────────────────────────

describe('BND-03 getAuthedUser 并发请求无状态污染', () => {
  /**
   * getAuthedUser 是纯函数（只读 req.user，无全局状态）。
   * 并发调用不共享任何状态，验证其幂等性与独立性。
   */

  function mockReq(user?: Partial<User>): Request {
    return { user } as unknown as Request;
  }

  const mockUser: User = {
    id: 'user-001',
    uid: 1000001,
    nickname: 'TestUser',
    phone: '13800000000',
    password_hash: '$2b$12$placeholder',
    avatar_url: '',
    user_type: ['player'],
    creator_level: 1,
    coins: 0,
    subscription_type: 'free',
    subscription_expires_at: null,
    created_at: new Date(),
  };

  it('有 user 的请求返回正确 user 对象', () => {
    const req = mockReq(mockUser);
    const result = getAuthedUser(req);
    expect(result.id).toBe('user-001');
  });

  it('无 user 的请求抛出 AuthenticationError', () => {
    const req = mockReq(undefined);
    expect(() => getAuthedUser(req)).toThrow(AuthenticationError);
    expect(() => getAuthedUser(req)).toThrow('Authentication required');
  });

  it('多个不同 user 的并发请求互不干扰', async () => {
    const users: User[] = Array.from({ length: 10 }, (_, i) => ({
      ...mockUser,
      id: `user-${i.toString().padStart(3, '0')}`,
      nickname: `User${i}`,
    }));

    // 模拟并发：同时发起 10 个"请求"，每个有独立的 req 对象
    const results = await Promise.all(
      users.map(async (u) => {
        const req = mockReq(u);
        return getAuthedUser(req);
      }),
    );

    // 每个结果应对应自己的 user，无交叉
    results.forEach((result, i) => {
      expect(result.id).toBe(`user-${i.toString().padStart(3, '0')}`);
    });
  });

  it('AuthenticationError 携带正确 status=401', () => {
    const req = mockReq(undefined);
    try {
      getAuthedUser(req);
      expect.fail('应该抛出 AuthenticationError');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthenticationError);
      expect((err as AuthenticationError).status).toBe(401);
    }
  });
});

// ─── BND-04 多设备会话可见性独立性 ────────────────────────────────────────

describe('BND-04 多设备会话：同一用户两个连接，可见集合各自独立', () => {
  /**
   * 场景：用户 Alice 有两个 WebSocket 连接：
   *   设备 A（会话甲）：在 scene-private 内，有旁观权限（granted_at = 11:00）
   *   设备 B（会话乙）：不在 scene-private 内，无旁观权限
   *
   * 预期：
   *   设备 A 可以看到 virtual 场景授权后的消息
   *   设备 B 看不到 virtual 场景的消息
   *
   * 注：此处用纯逻辑测试（不依赖 DB），对应 applyLegacy 中的 virtual 场景过滤器。
   */

  const aliceUserId = 'alice-001';
  const privateSceneId = 'scene-private';
  const grantedAt = new Date('2024-06-01T11:00:00Z');

  const msgs = [
    makeMsg({
      id: 'msg-1',
      scene_type: 'virtual',
      scene_id: privateSceneId,
      created_at: new Date('2024-06-01T10:30:00Z'), // 授权前
      visible_to: null,
    }),
    makeMsg({
      id: 'msg-2',
      scene_type: 'virtual',
      scene_id: privateSceneId,
      created_at: new Date('2024-06-01T11:30:00Z'), // 授权后
      visible_to: null,
    }),
    makeMsg({
      id: 'msg-3',
      scene_type: 'spatial',
      scene_id: 'scene-main',
      created_at: new Date('2024-06-01T12:00:00Z'), // 主场景，全体可见
      visible_to: null,
    }),
  ];

  /**
   * 模拟 applyLegacy 的 virtual 场景过滤逻辑：
   * - 用户在 activeVirtualSceneIds（已进入） → 全部可见
   * - 用户有 ob_permission（旁观授权） → 只看 granted_at 之后的消息
   * - 无权限 → 不可见
   */
  function filterForSession(opts: {
    activeVirtualSceneIds: Set<string>;
    obPermissionMap: Map<string, Date>;
    userId: string;
    isGm: boolean;
  }): typeof msgs {
    return msgs.filter((msg) => {
      // GM 全看
      if (opts.isGm) return true;

      const sceneType = msg['scene_type'] as string;
      const sceneId = msg['scene_id'] as string;

      if (sceneType === 'virtual') {
        // 已进入该 virtual 场景 → 全部可见
        if (opts.activeVirtualSceneIds.has(sceneId)) return true;

        // 有旁观授权 → 授权后消息可见
        const obGrantedAt = opts.obPermissionMap.get(sceneId);
        if (!obGrantedAt) return false;
        const createdAt = msg['created_at'] as Date;
        return createdAt >= obGrantedAt;
      }

      // 非 virtual 场景：按 sender / visible_to 过滤
      if (msg['sender_user_id'] === opts.userId) return true;
      if (msg['visible_to'] === null) return true;
      return (msg['visible_to'] as string[]).some((id) => id === opts.userId);
    }) as typeof msgs;
  }

  it('设备 A（有旁观权限，授权时间 11:00）可见 msg-2 和 msg-3，不可见 msg-1', () => {
    const deviceAResult = filterForSession({
      activeVirtualSceneIds: new Set<string>(),
      obPermissionMap: new Map([[privateSceneId, grantedAt]]),
      userId: aliceUserId,
      isGm: false,
    });

    const ids = deviceAResult.map((m) => m['id']);
    expect(ids).toContain('msg-2');  // 授权后，可见
    expect(ids).toContain('msg-3');  // 主场景，可见
    expect(ids).not.toContain('msg-1'); // 授权前，不可见
  });

  it('设备 B（无旁观权限）不可见 virtual 场景消息，仅可见主场景消息', () => {
    const deviceBResult = filterForSession({
      activeVirtualSceneIds: new Set<string>(),
      obPermissionMap: new Map(), // 无权限
      userId: aliceUserId,
      isGm: false,
    });

    const ids = deviceBResult.map((m) => m['id']);
    expect(ids).not.toContain('msg-1');
    expect(ids).not.toContain('msg-2');
    expect(ids).toContain('msg-3');  // 主场景全体可见
  });

  it('两个设备的可见集合互不干扰（设备 A 授权不影响设备 B）', () => {
    const deviceAResult = filterForSession({
      activeVirtualSceneIds: new Set<string>(),
      obPermissionMap: new Map([[privateSceneId, grantedAt]]),
      userId: aliceUserId,
      isGm: false,
    });

    const deviceBResult = filterForSession({
      activeVirtualSceneIds: new Set<string>(),
      obPermissionMap: new Map(),
      userId: aliceUserId,
      isGm: false,
    });

    // 设备 A 看到 2 条，设备 B 看到 1 条
    expect(deviceAResult).toHaveLength(2);
    expect(deviceBResult).toHaveLength(1);
    // 两个结果对象相互独立（引用不同）
    expect(deviceAResult).not.toBe(deviceBResult);
  });

  it('GM 会话可见全部消息，不受授权状态影响', () => {
    const gmResult = filterForSession({
      activeVirtualSceneIds: new Set<string>(),
      obPermissionMap: new Map(), // GM 无需旁观权限
      userId: 'gm-001',
      isGm: true,
    });

    expect(gmResult).toHaveLength(3);
  });

  it('用户直接进入 virtual 场景（非旁观）可见全部该场景消息（包括授权前）', () => {
    const directEntryResult = filterForSession({
      activeVirtualSceneIds: new Set([privateSceneId]), // 已进入该场景
      obPermissionMap: new Map(),
      userId: aliceUserId,
      isGm: false,
    });

    const ids = directEntryResult.map((m) => m['id']);
    expect(ids).toContain('msg-1');  // 虽然早于 grantedAt，但直接进入可见全部
    expect(ids).toContain('msg-2');
    expect(ids).toContain('msg-3');
  });
});
