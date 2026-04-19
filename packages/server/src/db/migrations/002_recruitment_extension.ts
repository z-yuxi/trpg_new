import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('recruitment_posts', (t) => {
    t.string('module_name', 128).nullable();
    t.integer('player_count_joined').notNullable().defaultTo(0);
    t.string('schedule_text', 255).nullable();
    t.text('description').nullable();
    t.json('tags').nullable();
    t.index(['status', 'created_at']);
    t.index(['ruleset_id', 'created_at']);
  });

  await knex.schema.createTable('recruitment_applications', (t) => {
    t.string('id', 64).primary();
    t.string('post_id', 64).notNullable().index();
    t.string('applicant_user_id', 64).notNullable().index();
    t.string('character_id', 64).nullable();
    t.text('message').notNullable();
    t.enu('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.unique(['post_id', 'applicant_user_id']);
  });

  await knex.schema.createTable('recruitment_comments', (t) => {
    t.string('id', 64).primary();
    t.string('post_id', 64).notNullable().index();
    t.string('user_id', 64).notNullable();
    t.text('content').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('user_notifications', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable().index();
    t.string('type', 48).notNullable();
    t.string('title', 128).notNullable();
    t.text('content').notNullable();
    t.json('metadata').nullable();
    t.boolean('is_read').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_notifications');
  await knex.schema.dropTableIfExists('recruitment_comments');
  await knex.schema.dropTableIfExists('recruitment_applications');

  await knex.schema.alterTable('recruitment_posts', (t) => {
    t.dropColumn('module_name');
    t.dropColumn('player_count_joined');
    t.dropColumn('schedule_text');
    t.dropColumn('description');
    t.dropColumn('tags');
  });
}
