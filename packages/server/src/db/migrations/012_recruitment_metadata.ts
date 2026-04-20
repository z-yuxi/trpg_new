import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('recruitment_posts', 'metadata');
  if (!hasColumn) {
    await knex.schema.alterTable('recruitment_posts', (table) => {
      table.json('metadata').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('recruitment_posts', 'metadata');
  if (hasColumn) {
    await knex.schema.alterTable('recruitment_posts', (table) => {
      table.dropColumn('metadata');
    });
  }
}
