import type { Knex } from 'knex';

/**
 * Migration 019: 规则集 Recipe 主线字段
 *
 * 新增三个 JSON 列：
 *   - recipe_source:   配方源码（编辑真源），RulesetRecipeSource | null
 *   - compiled_graph:  编译产物缓存，RulesetCompiledGraph | null
 *   - legacy:          是否为旧 atoms/connections 格式（tinyint 模拟 bool）
 *
 * 同步扩展 ruleset_versions.snapshot 列（JSON 类型已包含扩展字段，无需 DDL 改动）
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rulesets', (table) => {
    table.json('recipe_source').nullable().comment('配方源码（编辑真源）');
    table.json('compiled_graph').nullable().comment('编译产物缓存');
    table.tinyint('legacy').notNullable().defaultTo(1).comment('1=旧格式, 0=新Recipe格式');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rulesets', (table) => {
    table.dropColumn('recipe_source');
    table.dropColumn('compiled_graph');
    table.dropColumn('legacy');
  });
}
