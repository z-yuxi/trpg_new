import type { Knex } from 'knex';

/**
 * 迁移 047：ai_usage_log.task_type ENUM 补充 import_character 值
 *
 * MySQL ALTER TABLE MODIFY 无法直接扩充 ENUM，必须重新声明整个 ENUM 定义。
 * down() 将 task_type 还原为原始四值（忽略含新值的记录，生产降级前应先清理）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_usage_log', (table) => {
    table
      .enum('task_type', [
        'import_module',
        'check_text',
        'log_summary',
        'generate_recipe',
        'import_character',
      ])
      .notNullable()
      .alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('ai_usage_log', (table) => {
    table
      .enum('task_type', [
        'import_module',
        'check_text',
        'log_summary',
        'generate_recipe',
      ])
      .notNullable()
      .alter();
  });
}
