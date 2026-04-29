/**
 * ExperimentService — A/B 实验平台核心服务（附录 O）
 *
 * 分桶算法：MurmurHash3-inspired 确定性 hash
 *   bucket = hash(experimentId + ":" + userId) % 100
 *   若 bucket >= traffic_percent → 不在采样范围 → 返回控制组（对照组）
 *   否则：按 variants[].weight 加权分配（累积权重区间）
 *
 * 优点：
 *   - 同一用户在同一实验中始终分配到同一变体（幂等）
 *   - 无需持久化即可计算（分配结果仍持久化以便分析）
 */
import { db } from '../db';
import { generateId } from '@trpg/shared';
import { createHash } from 'crypto';

// ─── 类型 ──────────────────────────────────────────────────────────────────────

export interface ExperimentVariant {
  id: string;
  name: string;
  /** 相对权重（整数） */
  weight: number;
}

export interface Experiment {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'running' | 'paused' | 'concluded';
  variants: ExperimentVariant[];
  goal_event: string | null;
  traffic_percent: number;
  started_at: Date | null;
  ended_at: Date | null;
  created_by: string | null;
  created_at: Date;
}

export interface AssignmentResult {
  experimentId: string;
  variantId: string;
  /** false 表示该用户被 traffic_percent 过滤，使用 control（第一个变体） */
  inSample: boolean;
}

export interface ExperimentStats {
  experimentId: string;
  variants: Array<{
    variantId: string;
    variantName: string;
    exposures: number;
    conversions: number;
    conversionRate: number;
  }>;
  totalExposures: number;
  totalConversions: number;
}

// ─── 哈希分桶 ─────────────────────────────────────────────────────────────────

/**
 * 对 key 取 SHA-256 后取前 4 字节 → 0~99 的桶号（确定性，防冲突）
 */
function hashBucket(key: string): number {
  const hash = createHash('sha256').update(key).digest();
  // 取前 4 字节转 uint32，再 % 100
  const uint32 = ((hash[0]! << 24) | (hash[1]! << 16) | (hash[2]! << 8) | hash[3]!) >>> 0;
  return uint32 % 100;
}

/**
 * 按权重加权分配变体（确定性）
 */
function weightedVariant(variants: ExperimentVariant[], bucket: number): ExperimentVariant {
  const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
  // 将 bucket（0~99）映射到 0~totalWeight-1
  const idx = Math.floor((bucket / 100) * totalWeight);
  let acc = 0;
  for (const v of variants) {
    acc += v.weight;
    if (idx < acc) return v;
  }
  return variants[variants.length - 1]!;
}

// ─── 服务 ─────────────────────────────────────────────────────────────────────

export class ExperimentService {
  /**
   * 获取（或创建）用户在某实验中的分配结果
   *
   * - running 实验 → 计算 hash 分桶，持久化，返回变体
   * - 非 running → 始终返回对照组（第一个变体），不写 DB
   */
  async getAssignment(experimentName: string, userId: string): Promise<AssignmentResult | null> {
    const exp = await db('ab_experiments')
      .where({ name: experimentName })
      .first()
      .catch(() => null) as (Experiment & { variants: string | ExperimentVariant[] }) | null;

    if (!exp) return null;

    const variants: ExperimentVariant[] =
      typeof exp.variants === 'string' ? JSON.parse(exp.variants) : exp.variants;

    if (exp.status !== 'running') {
      // 非运行状态，返回对照组
      return { experimentId: exp.id, variantId: variants[0]!.id, inSample: false };
    }

    // 检查已有分配
    const existing = await db('ab_assignments')
      .where({ experiment_id: exp.id, user_id: userId })
      .first()
      .catch(() => null);

    if (existing) {
      return {
        experimentId: exp.id,
        variantId: existing.variant_id as string,
        inSample: Boolean(existing.in_sample),
      };
    }

    // 计算分桶
    const bucket = hashBucket(`${exp.id}:${userId}`);
    const inSample = bucket < exp.traffic_percent;
    let variantId: string;

    if (!inSample) {
      variantId = variants[0]!.id; // 对照组
    } else {
      variantId = weightedVariant(variants, bucket).id;
    }

    // 持久化分配（幂等：若并发重复插入，忽略冲突）
    try {
      await db('ab_assignments').insert({
        id: generateId(),
        experiment_id: exp.id,
        user_id: userId,
        variant_id: variantId,
        in_sample: inSample,
      });
    } catch {
      // 唯一冲突（并发）→ 忽略，返回刚才计算的变体
    }

    return { experimentId: exp.id, variantId, inSample };
  }

  /**
   * 批量获取用户的所有 running 实验分配（前端初始化时调用）
   * 返回 Map<experimentName, variantId>
   */
  async getAllAssignments(userId: string): Promise<Record<string, string>> {
    const experiments = await db('ab_experiments')
      .where({ status: 'running' })
      .select('id', 'name', 'variants', 'traffic_percent')
      .catch(() => []) as Array<{ id: string; name: string; variants: string; traffic_percent: number }>;

    const result: Record<string, string> = {};

    await Promise.all(
      experiments.map(async (exp) => {
        const assignment = await this.getAssignment(exp.name, userId);
        if (assignment) result[exp.name] = assignment.variantId;
      }),
    );

    return result;
  }

  /**
   * 追踪实验事件（曝光 / 转化 / 自定义）
   */
  async track(params: {
    experimentName: string;
    userId: string;
    eventType: 'expose' | 'convert' | 'custom';
    eventName?: string;
    properties?: Record<string, unknown>;
  }): Promise<void> {
    const assignment = await this.getAssignment(params.experimentName, params.userId);
    if (!assignment || !assignment.inSample) return; // 不追踪对照组/非采样用户

    await db('ab_events')
      .insert({
        id: generateId(),
        experiment_id: assignment.experimentId,
        user_id: params.userId,
        variant_id: assignment.variantId,
        event_type: params.eventType,
        event_name: params.eventName ?? null,
        properties: params.properties ? JSON.stringify(params.properties) : null,
      })
      .catch(() => null); // 追踪失败静默处理
  }

  /**
   * 获取实验结果汇总（用于后台数据看板）
   */
  async getStats(experimentName: string): Promise<ExperimentStats | null> {
    const exp = await db('ab_experiments')
      .where({ name: experimentName })
      .first()
      .catch(() => null) as (Experiment & { variants: string | ExperimentVariant[] }) | null;

    if (!exp) return null;

    const variants: ExperimentVariant[] =
      typeof exp.variants === 'string' ? JSON.parse(exp.variants) : exp.variants;

    // 曝光数
    const exposureRows = await db('ab_events')
      .where({ experiment_id: exp.id, event_type: 'expose' })
      .groupBy('variant_id')
      .select('variant_id')
      .count('* as count')
      .catch(() => []) as Array<{ variant_id: string; count: string | number }>;

    // 转化数
    const convertRows = await db('ab_events')
      .where({ experiment_id: exp.id, event_type: 'convert' })
      .groupBy('variant_id')
      .select('variant_id')
      .count('* as count')
      .catch(() => []) as Array<{ variant_id: string; count: string | number }>;

    const expMap = new Map(exposureRows.map((r) => [r.variant_id, Number(r.count)]));
    const cvtMap = new Map(convertRows.map((r) => [r.variant_id, Number(r.count)]));

    let totalExposures = 0;
    let totalConversions = 0;

    const variantStats = variants.map((v) => {
      const exposures = expMap.get(v.id) ?? 0;
      const conversions = cvtMap.get(v.id) ?? 0;
      totalExposures += exposures;
      totalConversions += conversions;
      return {
        variantId: v.id,
        variantName: v.name,
        exposures,
        conversions,
        conversionRate: exposures > 0 ? conversions / exposures : 0,
      };
    });

    return {
      experimentId: exp.id,
      variants: variantStats,
      totalExposures,
      totalConversions,
    };
  }

  /**
   * 创建实验（draft 状态）
   */
  async create(params: {
    name: string;
    description?: string;
    variants: ExperimentVariant[];
    goalEvent?: string;
    trafficPercent?: number;
    createdBy?: string;
  }): Promise<Experiment> {
    const id = generateId();
    await db('ab_experiments').insert({
      id,
      name: params.name,
      description: params.description ?? null,
      status: 'draft',
      variants: JSON.stringify(params.variants),
      goal_event: params.goalEvent ?? null,
      traffic_percent: params.trafficPercent ?? 100,
      created_by: params.createdBy ?? null,
    });
    return db('ab_experiments').where({ id }).first() as Promise<Experiment>;
  }

  /**
   * 更新实验状态（draft → running / paused → running / running → concluded 等）
   */
  async updateStatus(experimentName: string, status: Experiment['status']): Promise<void> {
    const updates: Record<string, unknown> = { status };
    if (status === 'running') updates.started_at = new Date();
    if (status === 'concluded') updates.ended_at = new Date();
    await db('ab_experiments').where({ name: experimentName }).update(updates);
  }
}

export const experimentService = new ExperimentService();
