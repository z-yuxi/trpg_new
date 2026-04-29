import type { Knex } from 'knex';

/**
 * 迁移：升级招募状态机
 * - recruitment_posts.status 扩展为 draft|open|full|grouped|closed|dissolved|archived
 * - recruitment_applications.status 扩展为 pending|invited|confirmed|waiting|rejected
 * - 新增 invited_expires_at、waiting_position、reject_reason 列
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.timestamp('invited_expires_at').nullable();
    t.integer('waiting_position').nullable();
    t.text('reject_reason').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.dropColumn('reject_reason');
    t.dropColumn('waiting_position');
    t.dropColumn('invited_expires_at');
  });
}
