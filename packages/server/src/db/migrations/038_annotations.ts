import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('annotations', (t) => {
    t.string('id', 20).primary();
    t.string('user_id', 20).notNullable().references('id').inTable('users').onDelete('CASCADE');
    /** 'module' | 'ruleset' */
    t.string('asset_type', 20).notNullable();
    t.string('asset_id', 20).notNullable();
    /** 用户选中的原文片段（前 500 字截断，用于定位与展示） */
    t.string('selected_text', 500).notNullable();
    /** 划线颜色标签: 'yellow' | 'green' | 'blue' | 'red' */
    t.string('color', 20).notNullable().defaultTo('yellow');
    /** 用户附加的笔记内容（可为空） */
    t.text('note').nullable();
    /** 文本在正文中的字符偏移，用于高亮还原 */
    t.integer('range_start').notNullable().defaultTo(0);
    t.integer('range_end').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id', 'asset_type', 'asset_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('annotations');
}
