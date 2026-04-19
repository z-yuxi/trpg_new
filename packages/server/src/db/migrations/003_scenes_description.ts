import type { Knex } from 'knex';

export async function up(knex: Knex) {
  await knex.schema.alterTable('scenes', (t) => {
    t.text('description').nullable().defaultTo('');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('scenes', (t) => {
    t.dropColumn('description');
  });
}
