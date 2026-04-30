import type { Knex } from 'knex';

/**
 * Migration 042: 热度计算所需字段
 *
 * modules 表:
 *   - reaction_count INT DEFAULT 0  — 用户表态数（点赞/收藏）
 *   - comment_count  INT DEFAULT 0  — 评论数（书评/留言，冗余计数）
 *   - is_featured    TINYINT(1) DEFAULT 0 — 申精推荐标记（管理员设置）
 *
 * forum_threads 表:
 *   - like_count  INT DEFAULT 0  — 帖子点赞数（线程级，非楼层级）
 *   - is_featured TINYINT(1) DEFAULT 0 — 申精推荐标记
 *
 * 热度公式：reaction_count×1 + comment_count×2 + is_featured×3
 *          like_count×1    + reply_count×2   + is_featured×3
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('modules', (table) => {
    table.integer('reaction_count').unsigned().notNullable().defaultTo(0);
    table.integer('comment_count').unsigned().notNullable().defaultTo(0);
    table.boolean('is_featured').notNullable().defaultTo(false).index();
  });

  await knex.schema.alterTable('forum_threads', (table) => {
    table.integer('like_count').unsigned().notNullable().defaultTo(0);
    table.boolean('is_featured').notNullable().defaultTo(false).index();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('forum_threads', (table) => {
    table.dropColumn('is_featured');
    table.dropColumn('like_count');
  });

  await knex.schema.alterTable('modules', (table) => {
    table.dropColumn('is_featured');
    table.dropColumn('comment_count');
    table.dropColumn('reaction_count');
  });
}
