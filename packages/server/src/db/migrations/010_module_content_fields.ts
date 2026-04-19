import type { Knex } from 'knex';

/**
 * Migration 010: 模组编辑器内容字段
 *
 * 为 modules 表添加编辑器所需字段：
 * - content (LONGTEXT)      TipTap JSON 文档
 * - outline (JSON)          大纲缓存（发布时生成）
 * - word_count (INT)        字数统计
 * - auto_saved_at (DATETIME) 最近自动保存时间
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('modules', (table) => {
    table.specificType('content', 'LONGTEXT').nullable();
    // MySQL JSON 列不支持 defaultTo，故 nullable 即可
    table.json('outline').nullable();
    table.integer('word_count').notNullable().defaultTo(0);
    table.dateTime('auto_saved_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('modules', (table) => {
    table.dropColumn('auto_saved_at');
    table.dropColumn('word_count');
    table.dropColumn('outline');
    table.dropColumn('content');
  });
}
