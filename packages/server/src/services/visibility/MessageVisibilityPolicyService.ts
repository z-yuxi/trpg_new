/**
 * MessageVisibilityPolicyService
 *
 * 历史消息可见性的唯一策略入口（PR-3 T3.2）。
 * 负责决定"某用户在某战役查询历史消息时，哪些消息对他可见"。
 *
 * 注意：本服务只处理历史查询路径，实时投递路径由 MessageVisibilityFilter（visibility.ts）负责。
 *
 * 灰度开关（T3.3）：
 *   VISIBILITY_POLICY=legacy  （默认）使用现有内联逻辑（一比一复刻）
 *   VISIBILITY_POLICY=new     使用新策略逻辑（当前与 legacy 等价，留接口给未来迭代）
 *
 * 切流前必须满足：连续 24h 无偏差告警（由抽样对比日志触发）。
 */

import { db } from '../../db';
import { getSceneActiveObPermissionMap } from '../scene-ob-permission-service';
import { safeJsonParse } from '../../utils/safe-json';

/** 项目未引入 pino，定义最小接口以支持未来提升为真正的结构化日志库 */
export interface WarnLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

// ─── 灰度开关 ──────────────────────────────────────────────────────────────
export const VISIBILITY_POLICY = (process.env['VISIBILITY_POLICY'] ?? 'legacy') as 'legacy' | 'new';

// 抽样率：1% 请求触发新旧对比（防日志爆炸）
const DIVERGENCE_SAMPLE_RATE = 0.01;

// ─── 类型 ─────────────────────────────────────────────────────────────────

export interface MessageQueryOptions {
  sceneId?: string;
  afterId?: string;
  limit?: number;
}

export type SerializedMessage = Record<string, unknown>;

// ─── 服务实现 ─────────────────────────────────────────────────────────────

export class MessageVisibilityPolicyService {
  private logger: WarnLogger | null;

  constructor(logger?: WarnLogger) {
    this.logger = logger ?? null;
  }

  /**
   * 查询并过滤战役消息，返回对 userId 可见的有序列表。
   *
   * @param campaignId  战役 ID
   * @param userId      当前用户 ID
   * @param isGm        是否为 GM
   * @param opts        查询参数（场景过滤、分页、条数上限）
   */
  async applyPolicy(
    campaignId: string,
    userId: string,
    isGm: boolean,
    opts: MessageQueryOptions = {},
  ): Promise<SerializedMessage[]> {
    const legacy = await this.applyLegacy(campaignId, userId, isGm, opts);

    if (VISIBILITY_POLICY === 'new') {
      // 当前 new 策略与 legacy 等价；此处留接口给 T3.2 后续实现
      return legacy;
    }

    // legacy 模式下，抽样对比（1%），异步不阻塞响应
    if (VISIBILITY_POLICY === 'legacy' && Math.random() < DIVERGENCE_SAMPLE_RATE) {
      // 不 await — 仅用于后台监控
      this.runDivergenceCheck(campaignId, userId, isGm, opts, legacy).catch(() => undefined);
    }

    return legacy;
  }

  // ─── Legacy 策略（完整保留原 campaigns.ts 内联逻辑）─────────────────────

  async applyLegacy(
    campaignId: string,
    userId: string,
    isGm: boolean,
    opts: MessageQueryOptions,
  ): Promise<SerializedMessage[]> {
    const { sceneId, afterId, limit = 50 } = opts;

    // 玩家需要的上下文数据
    let userCharIds: string[] = [];
    let activeVirtualSceneIds = new Set<string>();
    let activeObPermissionMap = new Map<string, Date>();

    if (!isGm) {
      const charRows = await db('character_sheets')
        .where({ user_id: userId })
        .join('character_scene_states', 'character_sheets.id', 'character_scene_states.character_id')
        .where('character_scene_states.campaign_id', campaignId)
        .select('character_sheets.id as char_id');
      userCharIds = (charRows as { char_id: string }[]).map((r) => r.char_id);

      if (userCharIds.length > 0) {
        const participationRows = await db('scene_participations as sp')
          .join('scenes as s', 's.id', 'sp.scene_id')
          .whereIn('sp.character_id', userCharIds)
          .whereNull('sp.left_at')
          .where('s.type', 'virtual')
          .where('s.campaign_id', campaignId)
          .select('sp.scene_id');
        activeVirtualSceneIds = new Set(
          (participationRows as { scene_id: string }[]).map((row) => row.scene_id),
        );
      }

      activeObPermissionMap = await getSceneActiveObPermissionMap(campaignId, userId);
    }

    // 基础查询
    let query = db('chat_messages as cm')
      .leftJoin('scenes as s', 's.id', 'cm.scene_id')
      .where('cm.campaign_id', campaignId)
      .select('cm.*', 's.type as scene_type')
      .orderBy('cm.id', 'asc')
      .limit(limit);

    if (afterId) {
      query = (query as ReturnType<typeof db>).where('cm.id', '>', afterId) as typeof query;
    }

    if (sceneId) {
      query = query.where('cm.scene_id', sceneId);

      // history_visibility 限制（仅非 GM）
      if (!isGm) {
        const scene = await db('scenes')
          .where({ id: sceneId })
          .select('history_visibility', 'visible_history_count')
          .first()
          .catch(() => null);

        if (scene && scene.history_visibility !== 'all') {
          if (scene.history_visibility === 'none') {
            if (userCharIds.length > 0) {
              query = query.whereExists(function (this: ReturnType<typeof db>) {
                (this as ReturnType<typeof db>)
                  .from('scene_participations as sp2')
                  .whereIn('sp2.character_id', userCharIds)
                  .where('sp2.scene_id', sceneId)
                  .whereRaw('sp2.joined_at <= cm.created_at')
                  .andWhere(function (this: ReturnType<typeof db>) {
                    (this as ReturnType<typeof db>)
                      .whereNull('sp2.left_at')
                      .orWhereRaw('sp2.left_at >= cm.created_at');
                  });
              });
            } else {
              query = query.whereRaw('1 = 0');
            }
          } else if (scene.history_visibility === 'recent') {
            const recentLimit = scene.visible_history_count ?? 20;
            query = db('chat_messages as cm')
              .leftJoin('scenes as s', 's.id', 'cm.scene_id')
              .where('cm.campaign_id', campaignId)
              .where('cm.scene_id', sceneId)
              .select('cm.*', 's.type as scene_type')
              .orderBy('cm.id', 'desc')
              .limit(recentLimit);
          }
        }
      }
    }

    const messages = await query;

    // 序列化
    const serialized: SerializedMessage[] = messages.map((m: Record<string, unknown>) => ({
      ...m,
      id: m['id']?.toString(),
      visible_to: safeJsonParse(m['visible_to'], null),
      story_time: safeJsonParse(m['story_time'], null),
      metadata: safeJsonParse(m['metadata'], null),
    }));

    // GM 可见全部
    if (isGm) return serialized;

    // 玩家按可见性规则过滤
    const filtered = serialized.filter((msg) => {
      const msgSceneType = String(msg['scene_type'] ?? '');
      const msgSceneId = String(msg['scene_id'] ?? '');

      if (msgSceneType === 'virtual') {
        if (!activeVirtualSceneIds.has(msgSceneId)) {
          const grantedAt = activeObPermissionMap.get(msgSceneId);
          if (!grantedAt) return false;
          const createdAtRaw = msg['created_at'];
          const createdAt =
            createdAtRaw instanceof Date ? createdAtRaw : new Date(String(createdAtRaw));
          if (Number.isNaN(createdAt.getTime())) return false;
          if (createdAt < grantedAt) return false;
        }
      }

      if (msg['sender_user_id'] === userId) return true;
      const msgType = msg['message_type'] as string;
      if (msgType === 'system' || msgType === 'announcement') return true;
      if (msg['visible_to'] === null) return true;
      return (msg['visible_to'] as string[]).some(
        (cid) => userCharIds.includes(cid) || cid === '*' || cid === userId,
      );
    });

    // recent 模式是 desc 查询，翻转为升序
    if (sceneId && !isGm) {
      const scene = await db('scenes')
        .where({ id: sceneId })
        .select('history_visibility')
        .first()
        .catch(() => null);
      if (scene?.history_visibility === 'recent') filtered.reverse();
    }

    return filtered;
  }

  // ─── 抽样对比（后台任务，不阻塞主流程）─────────────────────────────────

  private async runDivergenceCheck(
    campaignId: string,
    userId: string,
    isGm: boolean,
    opts: MessageQueryOptions,
    legacyResult: SerializedMessage[],
  ): Promise<void> {
    try {
      // 当 new 策略实现后，此处替换为真正的新策略调用
      const newResult = legacyResult; // placeholder

      const legacyIds = legacyResult.map((m) => m['id']);
      const newIds = (newResult as SerializedMessage[]).map((m) => m['id']);
      if (JSON.stringify(legacyIds) !== JSON.stringify(newIds)) {
        this.logger?.warn(
          { campaignId, userId, legacyIds, newIds },
          '[visibility] Policy divergence detected',
        );
        // TODO(#monitoring): 当接入 Prometheus/OpenTelemetry 后，将以上 warn 替换为：
        //   metrics.increment('visibility.divergence', { campaign_id: campaignId })
        // 迁移条件：连续 24h 无偏差告警后切 VISIBILITY_POLICY=new
      }
    } catch {
      // 对比失败不影响主流程
    }
  }
}

export const messageVisibilityPolicyService = new MessageVisibilityPolicyService();
