import type { Knex } from 'knex';

/**
 * 迁移：支付审计日志表
 *
 * payment_audit_log — 每次支付回调/权益发放均写一条，用于：
 *   - 排查回调重试问题
 *   - 对账补单审计
 *   - 监控告警触发溯源
 *
 * 字段说明：
 *   event_type  callback_received  三方回调到达
 *               grant_success      权益发放成功
 *               grant_failed       权益发放失败（含异常堆栈）
 *               idempotent_skip    幂等跳过（transaction_id 已处理）
 *               manual_grant       运营手动补单
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payment_audit_log', (t) => {
    t.string('id', 64).primary();
    t.string('order_id', 64).notNullable().index();
    t.string('user_id', 64).notNullable().index();
    t.enu('event_type', [
      'callback_received',
      'grant_success',
      'grant_failed',
      'idempotent_skip',
      'manual_grant',
    ]).notNullable();
    /** 三方流水号（回调携带） */
    t.string('transaction_id', 128).nullable();
    /** 支付渠道 */
    t.string('channel', 32).nullable();
    /** 回调原始 payload（截断到 8 KB 防止过大） */
    t.text('raw_payload').nullable();
    /** 本次回调声明的状态（paid / failed） */
    t.string('callback_status', 32).nullable();
    /** 错误信息（grant_failed 时填写） */
    t.text('error').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('payment_audit_log');
}
