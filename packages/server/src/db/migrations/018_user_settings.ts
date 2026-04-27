import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    // 隐私设置
    t.boolean('profile_public').defaultTo(true).notNullable();
    t.boolean('online_visible').defaultTo(true).notNullable();
    t.boolean('campaign_history_public').defaultTo(true).notNullable();
    // 通知设置（JSON 存储各类型开关）
    t.json('notification_settings').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('profile_public');
    t.dropColumn('online_visible');
    t.dropColumn('campaign_history_public');
    t.dropColumn('notification_settings');
  });
}
