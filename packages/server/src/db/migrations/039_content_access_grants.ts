import type { Knex } from 'knex';

/**
 * 迁移：内容访问授权表 + 积分流水表
 *
 * content_access_grants — 用户已购买内容的访问记录
 *   - (user_id, content_type, content_id) 联合唯一，防止重复发放权益
 *   - order_id 关联来源订单（审计用，可为 null 表示运营手动授予）
 *   - expires_at 为 null 表示永久授权
 *
 * coin_transactions — 积分变动流水（行为积分、购买积分、消费积分）
 */
export async function up(knex: Knex): Promise<void> {
  // 内容访问授权表
  await knex.schema.createTable('content_access_grants', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable().index();
    /** 内容类型：module / ruleset */
    t.string('content_type', 32).notNullable();
    /** 内容 ID */
    t.string('content_id', 64).notNullable();
    /** 关联来源订单（运营手动授予时可为 null） */
    t.string('order_id', 64).nullable();
    /** 过期时间，null 表示永久授权 */
    t.timestamp('expires_at').nullable();
    t.timestamp('granted_at').defaultTo(knex.fn.now()).notNullable();
    // 联合唯一：同一用户不可重复持有同一内容
    t.unique(['user_id', 'content_type', 'content_id'], { useConstraint: true });
  });

  // 积分变动流水表
  await knex.schema.createTable('coin_transactions', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable().index();
    /** 变动类型：earn=行为获取 purchase=充值购买 spend=消费 refund=退还 grant=运营赠送 */
    t.enu('tx_type', ['earn', 'purchase', 'spend', 'refund', 'grant']).notNullable();
    /** 变动量（正数=增加，负数=减少） */
    t.bigInteger('delta').notNullable();
    /** 变动后余额（快照，审计用） */
    t.bigInteger('balance_after').notNullable();
    /** 关联订单 / 事件 ID */
    t.string('ref_id', 64).nullable();
    t.string('note', 128).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('coin_transactions');
  await knex.schema.dropTableIfExists('content_access_grants');
}
