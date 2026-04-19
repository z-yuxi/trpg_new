import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('campaign_clues', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable().index();
    t.string('title', 200).notNullable();
    t.text('content').notNullable();
    t.string('theme', 32).notNullable();
    t.boolean('is_revealed').notNullable().defaultTo(false);
    t.json('revealed_to').nullable();
    t.timestamp('revealed_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('campaign_clues');
}