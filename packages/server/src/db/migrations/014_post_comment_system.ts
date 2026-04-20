import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 主楼层表（对招募帖的直接回复），楼层号从 2 起（1 预留给帖子正文）
  await knex.schema.createTableIfNotExists('post_replies', (t) => {
    t.string('id', 64).primary();
    t.string('post_id', 64).notNullable().index();
    t.string('user_id', 64).notNullable().index();
    t.integer('floor_number').unsigned().notNullable();
    t.text('content').notNullable();
    t.integer('like_count').unsigned().defaultTo(0);
    t.integer('reply_count').unsigned().defaultTo(0);
    t.boolean('is_original_post').defaultTo(false);
    t.boolean('deleted').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.index(['post_id', 'floor_number'], 'idx_post_floor');
    t.index(['post_id', 'created_at'], 'idx_post_created');
  });

  // 楼中楼表（单楼层下的二级评论，应用层强制嵌套 ≤ 1）
  await knex.schema.createTableIfNotExists('reply_comments', (t) => {
    t.string('id', 64).primary();
    t.string('reply_id', 64).notNullable().index();
    t.string('user_id', 64).notNullable().index();
    t.string('parent_comment_id', 64).nullable(); // @提及用，不新增嵌套层
    t.text('content').notNullable();
    t.integer('like_count').unsigned().defaultTo(0);
    t.boolean('deleted').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.index(['reply_id', 'created_at'], 'idx_reply_created');
  });

  // 楼层点赞防重复
  await knex.schema.createTableIfNotExists('floor_likes', (t) => {
    t.string('id', 64).primary();
    t.string('reply_id', 64).notNullable();
    t.string('user_id', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['reply_id', 'user_id'], { indexName: 'uk_floor_user' });
  });

  // 楼中楼点赞防重复
  await knex.schema.createTableIfNotExists('comment_likes', (t) => {
    t.string('id', 64).primary();
    t.string('comment_id', 64).notNullable();
    t.string('user_id', 64).notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['comment_id', 'user_id'], { indexName: 'uk_comment_user' });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('comment_likes');
  await knex.schema.dropTableIfExists('floor_likes');
  await knex.schema.dropTableIfExists('reply_comments');
  await knex.schema.dropTableIfExists('post_replies');
}
