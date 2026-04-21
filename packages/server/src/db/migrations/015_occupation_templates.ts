import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('occupation_templates', (t) => {
    t.string('id', 64).primary();
    t.string('ruleset_id', 64).notNullable().index();
    t.string('name', 128).notNullable();
    t.text('description').defaultTo('');
    /**
     * COC 静态职业 / DND 等级制职业
     * 'static'  = 一次性应用（默认，COC 风格）
     * 'leveled' = 等级成长（DND 风格）
     */
    t.enu('mode', ['static', 'leveled']).notNullable().defaultTo('static');
    /** 属性成长公式，JSON: Record<string, string>，如 { "STR": "1d4" } */
    t.json('attribute_growth').nullable();
    /** 技能点公式字符串，如 "EDU*2+APP*2"（COC 用） */
    t.string('skill_point_formula', 128).nullable();
    /** 信用评级范围，JSON: { min: number; max: number } */
    t.json('credit_rating').nullable();
    /** 本职技能列表，JSON: string[] */
    t.json('occupation_skills').nullable();
    /** 等级成长表，JSON: Record<number, LevelFeatures>（DND 用） */
    t.json('progression_table').nullable();
    /** 特性节点图（规则引擎扩展），JSON */
    t.json('feature_graph').nullable();
    /** 默认起始装备列表，JSON: string[] */
    t.json('starting_equipment').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('occupation_templates');
}
