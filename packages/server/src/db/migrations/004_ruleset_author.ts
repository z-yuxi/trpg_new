import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rulesets', (t) => {
    t.string('author_id', 64).nullable().after('id');
    t.text('description').nullable().after('version');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rulesets', (t) => {
    t.dropColumn('author_id');
    t.dropColumn('description');
  });
}
