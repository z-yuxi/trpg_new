import type { Knex } from 'knex';

/**
 * Migration 043: 机器人账号支持
 *
 * users 表新增字段：
 *   is_bot       — 是否为机器人账号（0/1）
 *   bot_status   — 机器人状态：active | hibernated | ops（转运营后去除机器人标记）
 *   bot_label    — 机器人角色标签（如"规则博士"/"故事编织者"），用于内容个性化
 *
 * forum_threads / forum_posts 新增字段：
 *   is_bot_generated — 该内容是否由机器人账号生成（用于清理 & 透明度管理）
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.tinyint('is_bot').unsigned().notNullable().defaultTo(0).index();
    table.enu('bot_status', ['active', 'hibernated']).nullable().defaultTo(null);
    table.string('bot_label', 64).nullable().defaultTo(null);
  });

  await knex.schema.alterTable('forum_threads', (table) => {
    table.tinyint('is_bot_generated').unsigned().notNullable().defaultTo(0).index();
  });

  await knex.schema.alterTable('forum_posts', (table) => {
    table.tinyint('is_bot_generated').unsigned().notNullable().defaultTo(0).index();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('forum_posts', (table) => {
    table.dropColumn('is_bot_generated');
  });

  await knex.schema.alterTable('forum_threads', (table) => {
    table.dropColumn('is_bot_generated');
  });

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('bot_label');
    table.dropColumn('bot_status');
    table.dropColumn('is_bot');
  });
}
