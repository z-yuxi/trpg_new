import type { Knex } from 'knex';

/** 为 scenes 表添加氛围关键词字段（E3 氛围系统） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scenes', (t) => {
    t.json('atmosphere_keywords').nullable().comment('氛围关键词数组，如 ["雨夜","潮湿"]');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scenes', (t) => {
    t.dropColumn('atmosphere_keywords');
  });
}
