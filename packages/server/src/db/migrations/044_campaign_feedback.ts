import type { Knex } from 'knex';

/**
 * 迁移 044：跑团反馈（Stars and Wishes）
 *
 * campaign_feedback — 每位参与者对每次跑团的 Star / Wish 反馈
 *
 * 设计依据：附录 C § 5.13 / 附录 B § 4.1
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('campaign_feedback', (t) => {
    t.string('id', 64).primary();
    /** 所属跑团 */
    t.string('campaign_id', 64).notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    /** 提交反馈的用户 */
    t.string('user_id', 64).notNullable();
    /** ⭐ Star（印象深刻的瞬间），选填，≤500 字 */
    t.string('star', 500).nullable();
    /** 💫 Wish（下次希望看到的），选填，≤500 字 */
    t.string('wish', 500).nullable();
    /** 可见范围：gm_only（默认）| all_members */
    t.enu('visibility', ['gm_only', 'all_members']).notNullable().defaultTo('gm_only');
    /** 是否被用户删除（软删除） */
    t.boolean('is_deleted').notNullable().defaultTo(false);
    t.timestamp('submitted_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').nullable();

    /** 每位用户在每个 campaign 只有一份反馈（提交即覆盖 → upsert） */
    t.unique(['campaign_id', 'user_id'], 'uk_campaign_feedback_unique');
    t.index('campaign_id', 'idx_campaign_feedback_campaign');
    t.index('user_id', 'idx_campaign_feedback_user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('campaign_feedback');
}
