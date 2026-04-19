import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('modules', (t) => {
    t.string('id', 64).primary();
    t.string('name', 200).notNullable();
    t.string('author_id', 64).notNullable().index();
    t.string('ruleset_id', 64).notNullable().index();
    t.text('description').notNullable().defaultTo('');
    t.string('cover_url', 512).notNullable().defaultTo('');
    t.enu('status', ['draft', 'public', 'archived']).notNullable().defaultTo('draft').index();
    t.enu('difficulty', ['easy', 'normal', 'hard']).nullable();
    t.integer('min_players').nullable();
    t.integer('max_players').nullable();
    t.string('style', 64).nullable();
    t.decimal('price', 10, 2).notNullable().defaultTo(0);
    t.decimal('rating', 3, 2).notNullable().defaultTo(0);
    t.integer('download_count').notNullable().defaultTo(0);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('user_module_purchases', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable().index();
    t.string('module_id', 64).notNullable().index();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_id', 'module_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_module_purchases');
  await knex.schema.dropTableIfExists('modules');
}