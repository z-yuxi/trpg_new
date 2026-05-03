import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('module_snapshots', (table) => {
    table.string('id', 64).primary();
    table.string('module_id', 64).notNullable();
    table.integer('version_number').notNullable(); // 从1开始递增
    table.specificType('content', 'LONGTEXT').notNullable(); // TipTap JSON 快照
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // 索引：快速查询某模组的所有版本（按版本号倒序）
    table.index(['module_id', 'version_number'], 'idx_module_snapshots_version');
    
    // 外键约束
    table.foreign('module_id').references('id').inTable('modules').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('module_snapshots');
}
