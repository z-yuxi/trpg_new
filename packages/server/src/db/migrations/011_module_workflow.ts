import type { Knex } from 'knex';

/**
 * Migration 011: 模组元数据字段 + 发布工作流字段
 *
 * 1. 为 modules 表增加元数据 JSON 列（tags/estimated_hours 等）
 * 2. 扩展 status 枚举，增加 reviewing / public_notice / suspended
 * 3. 增加发布流程字段：submitted_at / public_notice_end_at / suspended_reason / review_snapshot
 * 4. 新建 module_reports 表（举报记录）
 * 5. 新建 module_status_logs 表（状态变更审计日志）
 */
export async function up(knex: Knex): Promise<void> {
  // ── 1. 扩展 status 枚举（保持 'public' 兼容旧值）─────────────────────────
  await knex.raw(
    `ALTER TABLE modules MODIFY COLUMN status
     ENUM('draft','public','archived','reviewing','public_notice','suspended')
     NOT NULL DEFAULT 'draft'`
  );

  // ── 2. 增加元数据和发布流程字段 ────────────────────────────────────────────
  await knex.schema.alterTable('modules', (table) => {
    // 元数据 JSON（tags/estimated_hours/cover_url_raw 等可扩展字段）
    table.json('metadata').nullable();
    // 发布工作流字段
    table.dateTime('submitted_at').nullable();
    table.dateTime('public_notice_end_at').nullable();
    table.text('suspended_reason').nullable();
    table.specificType('review_snapshot', 'LONGTEXT').nullable();
  });

  // ── 3. module_reports 表 ───────────────────────────────────────────────────
  await knex.schema.createTable('module_reports', (table) => {
    table.string('id', 64).primary();
    table.string('module_id', 64).notNullable()
      .references('id').inTable('modules').onDelete('CASCADE');
    table.string('reporter_user_id', 64).notNullable();
    table.enu('report_type', ['plagiarism', 'violation', 'other']).notNullable();
    table.text('description').notNullable();
    table.enu('status', ['pending', 'resolved', 'dismissed'])
      .notNullable().defaultTo('pending');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['module_id']);
  });

  // ── 4. module_status_logs 表 ──────────────────────────────────────────────
  await knex.schema.createTable('module_status_logs', (table) => {
    table.string('id', 64).primary();
    table.string('module_id', 64).notNullable()
      .references('id').inTable('modules').onDelete('CASCADE');
    table.string('from_status', 32).notNullable();
    table.string('to_status', 32).notNullable();
    table.string('operator_user_id', 64).nullable(); // null = 系统自动触发
    table.text('reason').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['module_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('module_status_logs');
  await knex.schema.dropTableIfExists('module_reports');

  await knex.schema.alterTable('modules', (table) => {
    table.dropColumn('review_snapshot');
    table.dropColumn('suspended_reason');
    table.dropColumn('public_notice_end_at');
    table.dropColumn('submitted_at');
    table.dropColumn('metadata');
  });

  await knex.raw(
    `ALTER TABLE modules MODIFY COLUMN status
     ENUM('draft','public','archived')
     NOT NULL DEFAULT 'draft'`
  );
}
