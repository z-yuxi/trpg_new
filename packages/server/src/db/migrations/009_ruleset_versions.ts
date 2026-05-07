import type { Knex } from 'knex';

/**
 * Migration 009: 规则集版本控制 + 继承体系 + 发布状态机
 *
 * 1. 新建 ruleset_versions 表（版本快照）
 * 2. 修改 rulesets 表：扩展 status 枚举，增加 parent_id / fork_count / lock_version / latest_version_id
 */
export async function up(knex: Knex): Promise<void> {
  // ── 1. 创建 ruleset_versions 表 ──────────────────────────────────────────
  await knex.schema.createTable('ruleset_versions', (table) => {
    table.string('id', 36).primary();
    table.string('ruleset_id', 36).notNullable()
      .references('id').inTable('rulesets').onDelete('CASCADE');
    table.string('version_number', 50).notNullable();    // semver string e.g. "1.0.0"
    table.json('snapshot').notNullable();                 // 完整快照：atoms+connections+commands+schema
    table.text('changelog').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['ruleset_id', 'created_at']);
  });

  // ── 2. 修改 rulesets 表 ──────────────────────────────────────────────────
  await knex.schema.alterTable('rulesets', (table) => {
    // 分支继承
    table.string('parent_id', 36).nullable()
      .references('id').inTable('rulesets').onDelete('SET NULL');
    // fork 计数
    table.integer('fork_count').notNullable().defaultTo(0);
    // 乐观锁字段（每次 UPDATE 前校验并 +1）
    table.integer('lock_version').notNullable().defaultTo(0);
    // 最新版本 ID（外键，nullable 因为首次创建时还没有版本）
    table.string('latest_version_id', 36).nullable();
  });

  // ── 3. 扩展 status 枚举（MySQL MODIFY COLUMN） ──────────────────────────────
  // knex 不直接支持修改 ENUM，使用 raw SQL
  await knex.raw(`
    ALTER TABLE rulesets
    MODIFY COLUMN status ENUM('draft', 'reviewing', 'published', 'deprecated')
    NOT NULL DEFAULT 'draft'
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 恢复 status 枚举
  await knex.raw(`
    ALTER TABLE rulesets
    MODIFY COLUMN status ENUM('draft', 'published')
    NOT NULL DEFAULT 'draft'
  `);

  await knex.schema.alterTable('rulesets', (table) => {
    table.dropColumn('parent_id');
    table.dropColumn('fork_count');
    table.dropColumn('lock_version');
    table.dropColumn('latest_version_id');
  });

  await knex.schema.dropTableIfExists('ruleset_versions');
}
