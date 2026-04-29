import type { Knex } from 'knex';

/**
 * 迁移：升级招募状态机
 *
 * recruitment_posts.status
 *   旧: open | full | closed
 *   新: draft | open | full | grouped | closed | dissolved | archived
 *
 * recruitment_applications.status
 *   旧: pending | approved | rejected
 *   新: pending | invited | confirmed | waiting | rejected
 *
 * 新增字段: invited_expires_at, waiting_position, reject_reason
 * 新增索引: (post_id, status), invited_expires_at, waiting_position
 */
export async function up(knex: Knex): Promise<void> {
  // 1. 扩展 recruitment_posts.status
  //    SQLite 通过 CHECK 约束实现枚举校验；MySQL/PostgreSQL 需 ALTER TYPE。
  //    Knex 的 .enu() 在 SQLite 下不生成约束，因此此处只做 string 列重建保证兼容性。
  //    实际写入由应用层 TypeScript 枚举保证，此处迁移主要处理 grouped 这个新状态。
  //    已有行的 status='closed' 且 campaign_id IS NOT NULL 迁移为 'grouped'。
  await knex('recruitment_posts')
    .whereNotNull('campaign_id')
    .where('status', 'closed')
    .update({ status: 'grouped' });

  // 2. 扩展 recruitment_applications.status
  //    已有 'approved' → 改为 'confirmed'（语义等价：玩家已确认席位）
  await knex('recruitment_applications')
    .where('status', 'approved')
    .update({ status: 'confirmed' });

  // 3. 新增字段
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.timestamp('invited_expires_at').nullable();
    t.integer('waiting_position').nullable();
    t.text('reject_reason').nullable();
  });

  // 4. 新增索引
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.index(['post_id', 'status'], 'idx_rec_apps_post_status');
  });
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.index(['invited_expires_at'], 'idx_rec_apps_invite_expiry');
  });
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.index(['post_id', 'waiting_position'], 'idx_rec_apps_waiting');
  });
}

export async function down(knex: Knex): Promise<void> {
  // 回滚索引
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.dropIndex([], 'idx_rec_apps_waiting');
    t.dropIndex([], 'idx_rec_apps_invite_expiry');
    t.dropIndex([], 'idx_rec_apps_post_status');
  });

  // 回滚字段
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.dropColumn('reject_reason');
    t.dropColumn('waiting_position');
    t.dropColumn('invited_expires_at');
  });

  // 回滚数据：confirmed → approved, grouped → closed
  await knex('recruitment_applications')
    .where('status', 'confirmed')
    .update({ status: 'approved' });

  await knex('recruitment_posts')
    .where('status', 'grouped')
    .update({ status: 'closed' });
}
