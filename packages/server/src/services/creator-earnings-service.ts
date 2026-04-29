import { db } from '../db';
import { generateId } from '@trpg/shared';

/** 平台抽成比例（整数百分比） */
const PLATFORM_FEE_PCT = 30;

export interface EarningsSummary {
  user_id: string;
  available_cents: number;
  total_earned_cents: number;
  total_withdrawn_cents: number;
  updated_at: Date;
}

export interface ModuleSaleRecord {
  id: string;
  module_id: string;
  buyer_user_id: string;
  author_user_id: string;
  price_cents: number;
  platform_fee_pct: number;
  author_amount_cents: number;
  payment_order_id: string | null;
  status: 'pending' | 'settled' | 'refunded';
  settled_at: Date | null;
  created_at: Date;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount_cents: number;
  channel: 'alipay' | 'wechat' | 'bank';
  account_info: string;
  status: 'pending' | 'processing' | 'paid' | 'rejected';
  admin_note: string | null;
  operator_id: string | null;
  processed_at: Date | null;
  created_at: Date;
}

export interface ModuleObjection {
  id: string;
  module_id: string;
  user_id: string;
  type: 'objection' | 'appeal';
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  admin_reply: string | null;
  operator_id: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

export class CreatorEarningsService {
  /**
   * 记录一笔模组销售并结算作者收益（原子事务）。
   * 免费模组（price_cents=0）同样记录流水，但金额为零。
   */
  async recordSale(params: {
    moduleId: string;
    buyerUserId: string;
    authorUserId: string;
    priceCents: number;
    paymentOrderId?: string;
  }): Promise<ModuleSaleRecord> {
    const authorAmount = Math.floor(params.priceCents * (1 - PLATFORM_FEE_PCT / 100));
    const id = generateId();
    const now = new Date();

    await db.transaction(async (trx) => {
      await trx('module_sales').insert({
        id,
        module_id: params.moduleId,
        buyer_user_id: params.buyerUserId,
        author_user_id: params.authorUserId,
        price_cents: params.priceCents,
        platform_fee_pct: PLATFORM_FEE_PCT,
        author_amount_cents: authorAmount,
        payment_order_id: params.paymentOrderId ?? null,
        status: 'settled',
        settled_at: now,
        created_at: now,
      });

      if (authorAmount > 0) {
        const existing = await trx('creator_earnings').where({ user_id: params.authorUserId }).first();
        if (existing) {
          await trx('creator_earnings').where({ user_id: params.authorUserId }).update({
            available_cents: (existing.available_cents ?? 0) + authorAmount,
            total_earned_cents: (existing.total_earned_cents ?? 0) + authorAmount,
            updated_at: now,
          });
        } else {
          await trx('creator_earnings').insert({
            user_id: params.authorUserId,
            available_cents: authorAmount,
            total_earned_cents: authorAmount,
            total_withdrawn_cents: 0,
            updated_at: now,
          });
        }
      }
    });

    return (await db('module_sales').where({ id }).first()) as ModuleSaleRecord;
  }

  /** 查询创作者收益汇总（不存在时返回零值对象） */
  async getSummary(userId: string): Promise<EarningsSummary> {
    const row = await db('creator_earnings').where({ user_id: userId }).first();
    if (!row) {
      return {
        user_id: userId,
        available_cents: 0,
        total_earned_cents: 0,
        total_withdrawn_cents: 0,
        updated_at: new Date(),
      };
    }
    return row as EarningsSummary;
  }

  /** 查询销售明细列表（按时间倒序，分页） */
  async listSales(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: ModuleSaleRecord[]; total: number; page: number; limit: number }> {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset = (Math.max(1, page) - 1) * safeLimit;

    const totalRow = await db('module_sales')
      .where({ author_user_id: userId })
      .count<{ count: string }>({ count: '*' })
      .first();

    const saleRows = await db('module_sales as s')
      .leftJoin('modules as m', 'm.id', 's.module_id')
      .where('s.author_user_id', userId)
      .select('s.*', 'm.name as module_name')
      .orderBy('s.created_at', 'desc')
      .limit(safeLimit)
      .offset(offset);

    return {
      data: saleRows as ModuleSaleRecord[],
      total: Number(totalRow?.count ?? 0),
      page: Math.max(1, page),
      limit: safeLimit,
    };
  }

  /**
   * 提交提现申请（原子扣减可用余额）。
   * 最低提现金额 10000 分（100 元）。
   */
  async createWithdrawal(params: {
    userId: string;
    amountCents: number;
    channel: 'alipay' | 'wechat' | 'bank';
    accountInfo: string;
  }): Promise<{ ok: boolean; error?: string; data?: WithdrawalRequest }> {
    if (params.amountCents <= 0) {
      return { ok: false, error: 'amount_must_be_positive' };
    }
    if (params.amountCents < 10_000) {
      return { ok: false, error: 'minimum_withdrawal_100_yuan' };
    }
    if (!params.accountInfo || params.accountInfo.trim().length < 2) {
      return { ok: false, error: 'account_info_required' };
    }

    const summary = await this.getSummary(params.userId);
    if (params.amountCents > summary.available_cents) {
      return { ok: false, error: 'insufficient_balance' };
    }

    const id = generateId();
    const now = new Date();

    await db.transaction(async (trx) => {
      await trx('withdrawal_requests').insert({
        id,
        user_id: params.userId,
        amount_cents: params.amountCents,
        channel: params.channel,
        account_info: params.accountInfo.trim(),
        status: 'pending',
        created_at: now,
      });
      // 冻结可用余额（提现中途不可再重复申请相同金额）
      await trx('creator_earnings').where({ user_id: params.userId }).update({
        available_cents: summary.available_cents - params.amountCents,
        updated_at: now,
      });
    });

    const record = (await db('withdrawal_requests').where({ id }).first()) as WithdrawalRequest;
    return { ok: true, data: record };
  }

  /** 查询提现申请列表（按时间倒序，分页） */
  async listWithdrawals(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{ data: WithdrawalRequest[]; total: number; page: number; limit: number }> {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const offset = (Math.max(1, page) - 1) * safeLimit;

    const totalRow = await db('withdrawal_requests')
      .where({ user_id: userId })
      .count<{ count: string }>({ count: '*' })
      .first();

    const wRows = await db('withdrawal_requests')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(safeLimit)
      .offset(offset);

    return {
      data: wRows as WithdrawalRequest[],
      total: Number(totalRow?.count ?? 0),
      page: Math.max(1, page),
      limit: safeLimit,
    };
  }

  /** 提交公示期异议（任何登录用户） */
  async submitObjection(params: {
    moduleId: string;
    userId: string;
    reason: string;
  }): Promise<ModuleObjection> {
    const id = generateId();
    const now = new Date();
    await db('module_objections').insert({
      id,
      module_id: params.moduleId,
      user_id: params.userId,
      type: 'objection',
      reason: params.reason.trim(),
      status: 'pending',
      created_at: now,
    });
    return (await db('module_objections').where({ id }).first()) as ModuleObjection;
  }

  /** 提交作者申诉（仅模组作者，在审核被拒 / 公示期被阻止后） */
  async submitAppeal(params: {
    moduleId: string;
    userId: string;
    reason: string;
  }): Promise<{ ok: boolean; error?: string; data?: ModuleObjection }> {
    // 验证是否为模组作者
    const module = await db('modules').where({ id: params.moduleId }).first();
    if (!module) return { ok: false, error: 'module_not_found' };
    if (module.author_id !== params.userId) return { ok: false, error: 'forbidden' };

    // 只有 reviewing/public_notice/suspended 状态允许申诉
    const appealableStatuses = ['reviewing', 'public_notice', 'suspended'];
    if (!appealableStatuses.includes(module.status)) {
      return { ok: false, error: 'not_in_appealable_status' };
    }

    // 同一模组同一用户不得重复提交未处理的申诉
    const existing = await db('module_objections')
      .where({ module_id: params.moduleId, user_id: params.userId, type: 'appeal', status: 'pending' })
      .first();
    if (existing) return { ok: false, error: 'appeal_already_pending' };

    const id = generateId();
    const now = new Date();
    await db('module_objections').insert({
      id,
      module_id: params.moduleId,
      user_id: params.userId,
      type: 'appeal',
      reason: params.reason.trim(),
      status: 'pending',
      created_at: now,
    });
    const record = (await db('module_objections').where({ id }).first()) as ModuleObjection;
    return { ok: true, data: record };
  }

  /** 查询某模组的公示期异议列表（运营可见） */
  async listObjections(moduleId: string): Promise<ModuleObjection[]> {
    return db('module_objections')
      .where({ module_id: moduleId, type: 'objection' })
      .orderBy('created_at', 'asc') as unknown as Promise<ModuleObjection[]>;
  }
}

export const creatorEarningsService = new CreatorEarningsService();
