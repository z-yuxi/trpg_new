import type { Knex } from 'knex';

/**
 * 为 modules 与 rulesets 表新增 reader_settings JSON 列，
 * 存储叙阅器插件开关、保护规则和外观配置（见产品设计 §14.8 / D04 §2.6）。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('modules', (t) => {
    t.jsonb('reader_settings').nullable().defaultTo(null);
  });
  await knex.schema.alterTable('rulesets', (t) => {
    t.jsonb('reader_settings').nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('modules', (t) => {
    t.dropColumn('reader_settings');
  });
  await knex.schema.alterTable('rulesets', (t) => {
    t.dropColumn('reader_settings');
  });
}
