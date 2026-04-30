import type { Knex } from 'knex';

/**
 * 迁移 032：users 表补充内容偏好列
 *
 * content_preferences: JSON 存储 { rule_prefs: string[], genre_prefs: string[] }
 * 隐私设置字段补充 dm_visibility / allow_stats / allow_ai_train
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.json('content_preferences').nullable();
    // 私信可见性: all | following | none
    t.string('dm_visibility', 16).defaultTo('all');
    t.boolean('allow_stats').defaultTo(true);
    t.boolean('allow_ai_train').defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('content_preferences');
    t.dropColumn('dm_visibility');
    t.dropColumn('allow_stats');
    t.dropColumn('allow_ai_train');
  });
}
