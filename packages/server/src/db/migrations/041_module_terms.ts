/**
 * Migration 041: module_terms 表
 *
 * 为每个模组存储创作者维护的术语白名单（AI 校对/分析时自动带入）。
 * 每行一个术语，按 (module_id, term) 唯一约束去重。
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('module_terms', (table) => {
    table.string('id', 64).primary();
    table.string('module_id', 64).notNullable();
    table.string('term', 64).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['module_id', 'term'], { indexName: 'uniq_module_term' });
    table.index('module_id', 'idx_module_terms_module');

    table
      .foreign('module_id')
      .references('id')
      .inTable('modules')
      .onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('module_terms');
}
