import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('campaign_grid_maps', (t) => {
    t.string('id', 64).primary();
    t.string('campaign_id', 64).notNullable().index();
    t.string('scene_id', 64).notNullable().index();
    t.integer('cols').notNullable().defaultTo(12);
    t.integer('rows').notNullable().defaultTo(10);
    t.integer('cell_size').notNullable().defaultTo(48);
    t.string('background_image_url', 512).nullable();
    t.json('tokens').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());

    t.unique(['campaign_id', 'scene_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('campaign_grid_maps');
}