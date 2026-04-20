import type { Knex } from 'knex';

/**
 * Migration 012: 角色团内实例扩展字段
 *
 * character_scene_states 补充：
 *   - derived_current  JSON  当前 HP/MP/SAN 等（可独立于模板变化）
 *   - temporary_effects JSON 临时效果列表
 *   - equipment         JSON 团内装备列表（覆盖模板装备）
 *   - skill_growth_marks JSON 待成长技能标记（/en 指令设置，/ti 指令消费）
 *
 * character_sheets 补充：
 *   - skill_growth_marks JSON 模板上的技能待成长标记（跨团同步时使用）
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('character_scene_states', (table) => {
    table.json('derived_current').nullable();
    table.json('temporary_effects').nullable();
    table.json('equipment').nullable();
    table.json('skill_growth_marks').nullable();
  });

  // character_sheets 也增加 skill_growth_marks（模板层）
  await knex.schema.alterTable('character_sheets', (table) => {
    table.json('skill_growth_marks').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('character_scene_states', (table) => {
    table.dropColumn('derived_current');
    table.dropColumn('temporary_effects');
    table.dropColumn('equipment');
    table.dropColumn('skill_growth_marks');
  });
  await knex.schema.alterTable('character_sheets', (table) => {
    table.dropColumn('skill_growth_marks');
  });
}
