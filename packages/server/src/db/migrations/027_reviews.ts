import type { Knex } from 'knex';

/**
 * 迁移 027：跑团互评与信誉分系统
 *
 * campaign_reviews  — GM↔玩家双向评价（房间结束后触发）
 * user_reputation   — 信誉汇总（滚动均值，冗余存储加速读取）
 */
export async function up(knex: Knex): Promise<void> {
  // ── 评价记录 ──────────────────────────────────────────────────────────────
  await knex.schema.createTable('campaign_reviews', (t) => {
    t.string('id', 64).primary();
    /** 评价所属的房间 */
    t.string('campaign_id', 64).notNullable();
    /** 评价人 */
    t.string('reviewer_id', 64).notNullable();
    /** 被评价人 */
    t.string('reviewee_id', 64).notNullable();
    /** 评价人在此次跑团中的角色 */
    t.enu('reviewer_role', ['gm', 'player']).notNullable();
    /** 星级：1~5 */
    t.tinyint('rating').unsigned().notNullable();
    /** 文字评价（可选，最长 500 字） */
    t.string('comment', 500).nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());

    // 每个 reviewer 对每个 reviewee 在同一 campaign 只能评价一次
    t.unique(['campaign_id', 'reviewer_id', 'reviewee_id']);
    t.index(['reviewee_id', 'created_at']);
    t.index('campaign_id');
  });

  // ── 信誉汇总（冗余快照，每次写评价时更新） ───────────────────────────────
  await knex.schema.createTable('user_reputation', (t) => {
    t.string('user_id', 64).primary();
    /** 所有收到评价的平均星级（保留两位小数） */
    t.decimal('avg_rating', 5, 2).defaultTo(0).notNullable();
    /** 总收到评价数 */
    t.integer('total_reviews').unsigned().defaultTo(0).notNullable();
    /** 作为 GM 收到的评价数 */
    t.integer('gm_reviews').unsigned().defaultTo(0).notNullable();
    /** 作为玩家收到的评价数 */
    t.integer('player_reviews').unsigned().defaultTo(0).notNullable();
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_reputation');
  await knex.schema.dropTableIfExists('campaign_reviews');
}
