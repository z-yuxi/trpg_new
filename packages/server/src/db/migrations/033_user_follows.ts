import type { Knex } from 'knex';

/**
 * 迁移 033：用户关注关系表
 *
 * user_follows(follower_id, followee_id) 联合主键
 * 同时在 users 表缓存 follower_count / following_count，避免每次 COUNT(*)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_follows', (t) => {
    t.string('follower_id', 64).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('followee_id', 64).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.primary(['follower_id', 'followee_id']);
    t.index(['followee_id']); // 查询某人的粉丝
  });

  // 缓存计数列（允许现有数据为空）
  await knex.schema.alterTable('users', (t) => {
    t.integer('follower_count').defaultTo(0);
    t.integer('following_count').defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_follows');
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('follower_count');
    t.dropColumn('following_count');
  });
}
