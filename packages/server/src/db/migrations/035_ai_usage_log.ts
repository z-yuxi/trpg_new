import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ai_usage_log', (table) => {
    table.string('id', 64).primary();
    table.string('user_id', 64).notNullable();
    table
      .enum('task_type', ['import_module', 'check_text', 'log_summary', 'generate_recipe'])
      .notNullable();
    table.enum('endpoint', ['pro', 'flash']).notNullable();
    table.enum('status', ['success', 'failed', 'queued']).notNullable();
    table.integer('input_tokens').notNullable().defaultTo(0);
    table.integer('output_tokens').notNullable().defaultTo(0);
    table.integer('cost_cents').notNullable().defaultTo(0);
    table.integer('duration_ms').notNullable().defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    // 按用户+任务类型+月份快速聚合
    table.index(['user_id', 'task_type', 'created_at'], 'idx_ai_user_month');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('ai_usage_log');
}
