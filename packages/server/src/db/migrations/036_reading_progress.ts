import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reading_progress', (t) => {
    t.string('id', 20).primary();
    t.string('user_id', 20).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('asset_type', 20).notNullable(); // 'module' | 'ruleset'
    t.string('asset_id', 20).notNullable();
    /** 0–100 整数百分比 */
    t.integer('scroll_percent').notNullable().defaultTo(0);
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['user_id', 'asset_type', 'asset_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reading_progress');
}
