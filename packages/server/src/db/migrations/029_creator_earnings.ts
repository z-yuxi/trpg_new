import type { Knex } from 'knex';

/**
 * 迁移 029：创作者收益系统
 *
 * module_sales         — 模组销售流水（购买记录 → 分成入账）
 * creator_earnings     — 创作者收益账户（可提现余额汇总）
 * withdrawal_requests  — 提现申请（含审核状态）
 * module_objections    — 公示期异议 / 作者申诉记录
 */
export async function up(knex: Knex): Promise<void> {
  // ── 模组销售流水 ──────────────────────────────────────────────────────────
  await knex.schema.createTable('module_sales', (t) => {
    t.string('id', 64).primary();
    t.string('module_id', 64).notNullable().index();
    t.string('buyer_user_id', 64).notNullable().index();
    t.string('author_user_id', 64).notNullable().index();
    /** 购买价格（人民币分） */
    t.integer('price_cents').unsigned().notNullable();
    /** 平台分成比例（整数百分比，默认 30） */
    t.integer('platform_fee_pct').unsigned().notNullable().defaultTo(30);
    /** 作者实收（分） = price_cents * (1 - platform_fee_pct/100) */
    t.integer('author_amount_cents').unsigned().notNullable();
    /** 关联支付订单（免费模组可为 null） */
    t.string('payment_order_id', 64).nullable();
    t.enu('status', ['pending', 'settled', 'refunded']).defaultTo('pending').notNullable();
    t.timestamp('settled_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── 创作者收益账户（每位创作者一行） ──────────────────────────────────────
  await knex.schema.createTable('creator_earnings', (t) => {
    t.string('user_id', 64).primary();
    /** 当前可提现余额（分） */
    t.integer('available_cents').unsigned().notNullable().defaultTo(0);
    /** 历史累计收入（分） */
    t.integer('total_earned_cents').unsigned().notNullable().defaultTo(0);
    /** 历史累计已提现（分） */
    t.integer('total_withdrawn_cents').unsigned().notNullable().defaultTo(0);
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // ── 提现申请 ──────────────────────────────────────────────────────────────
  await knex.schema.createTable('withdrawal_requests', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable().index();
    /** 申请金额（分），最低 10000（100 元） */
    t.integer('amount_cents').unsigned().notNullable();
    t.enu('channel', ['alipay', 'wechat', 'bank']).notNullable();
    /** 收款账号（支付宝账号 / 微信号 / 银行卡号+姓名） */
    t.string('account_info', 256).notNullable();
    t.enu('status', ['pending', 'processing', 'paid', 'rejected']).defaultTo('pending').notNullable();
    /** 运营处理备注 */
    t.string('admin_note', 512).nullable();
    t.string('operator_id', 64).nullable();
    t.timestamp('processed_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // ── 公示期异议 / 作者申诉 ─────────────────────────────────────────────────
  await knex.schema.createTable('module_objections', (t) => {
    t.string('id', 64).primary();
    t.string('module_id', 64).notNullable().index();
    t.string('user_id', 64).notNullable().index();
    /** objection = 第三方异议；appeal = 作者在审核被拒后的申诉 */
    t.enu('type', ['objection', 'appeal']).notNullable();
    t.text('reason').notNullable();
    t.enu('status', ['pending', 'resolved', 'dismissed']).defaultTo('pending').notNullable();
    t.string('admin_reply', 1024).nullable();
    t.string('operator_id', 64).nullable();
    t.timestamp('resolved_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('module_objections');
  await knex.schema.dropTableIfExists('withdrawal_requests');
  await knex.schema.dropTableIfExists('creator_earnings');
  await knex.schema.dropTableIfExists('module_sales');
}
