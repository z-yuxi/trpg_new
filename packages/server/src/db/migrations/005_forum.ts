import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('forum_threads', (t) => {
    t.string('id', 64).primary();
    t.enum('board', ['rules', 'creation', 'experience', 'newbie', 'lounge']).notNullable();
    t.string('author_id', 64).notNullable().index();
    t.string('title', 200).notNullable();
    t.text('content').notNullable();
    t.integer('view_count').unsigned().defaultTo(0);
    t.integer('reply_count').unsigned().defaultTo(0);
    t.boolean('is_pinned').defaultTo(false);
    t.boolean('is_locked').defaultTo(false);
    t.timestamp('last_reply_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('forum_posts', (t) => {
    t.string('id', 64).primary();
    t.string('thread_id', 64).notNullable().references('id').inTable('forum_threads').onDelete('CASCADE');
    t.string('author_id', 64).notNullable().index();
    t.text('content').notNullable();
    t.integer('floor_number').unsigned().notNullable();
    t.string('reply_to_post_id', 64).nullable().references('id').inTable('forum_posts').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('forum_posts');
  await knex.schema.dropTableIfExists('forum_threads');
}
