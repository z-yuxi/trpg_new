import type { Knex } from 'knex';

/**
 * 迁移：商业化基础表
 *
 * payment_orders — 支付订单（充值/订阅）
 * subscription_events — 会员变更事件日志（审计用）
 */
export async function up(knex: Knex): Promise<void> {
  // 支付订单表
  await knex.schema.createTable('payment_orders', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable().index();
    /** 商品类型：sub_pro / sub_creator / coins / feature_unlock */
    t.enu('product_type', ['sub_pro', 'sub_creator', 'coins', 'feature_unlock']).notNullable();
    /** 商品 SKU 标识（如 "pro_monthly"/"coins_100"） */
    t.string('product_sku', 64).notNullable();
    /** 原始金额（分） */
    t.integer('amount_cents').unsigned().notNullable();
    /** 支付渠道：alipay / wechat / stripe / internal（内部赠送） */
    t.enu('channel', ['alipay', 'wechat', 'stripe', 'internal']).notNullable();
    /** 三方流水号 */
    t.string('external_order_id', 128).nullable().unique();
    t.enu('status', ['pending', 'paid', 'refunded', 'failed']).defaultTo('pending').notNullable();
    t.json('metadata').nullable();
    t.timestamp('paid_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 会员变更事件表（审计 + 恢复 + 到期检查）
  await knex.schema.createTable('subscription_events', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable().index();
    t.enu('event_type', ['subscribe', 'renew', 'upgrade', 'downgrade', 'expire', 'cancel', 'grant']).notNullable();
    t.enu('from_tier', ['free', 'pro', 'creator']).nullable();
    t.enu('to_tier', ['free', 'pro', 'creator']).notNullable();
    /** 关联订单 ID（内部赠送时可为空） */
    t.string('order_id', 64).nullable();
    /** 本次周期到期时间 */
    t.timestamp('expires_at').nullable();
    t.string('operator_id', 64).nullable();  // 运营手工操作时记录
    t.json('metadata').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // users 表新增到期时间列（subscription_expires_at）
  await knex.schema.alterTable('users', (t) => {
    t.timestamp('subscription_expires_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('subscription_expires_at');
  });
  await knex.schema.dropTableIfExists('subscription_events');
  await knex.schema.dropTableIfExists('payment_orders');
}
