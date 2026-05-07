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
  // 1. 先扩展枚举，再执行数据改写，避免 MySQL ENUM 截断错误
  await knex.raw(`
    ALTER TABLE recruitment_posts
    MODIFY COLUMN status ENUM('draft', 'open', 'full', 'grouped', 'closed', 'dissolved', 'archived')
    NOT NULL DEFAULT 'open'
  `);

  await knex.raw(`
    ALTER TABLE recruitment_applications
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'invited', 'confirmed', 'waiting')
    NOT NULL DEFAULT 'pending'
  `);

  // 2. recruitment_posts: 已有 status='closed' 且 campaign_id IS NOT NULL 迁移为 'grouped'
  await knex('recruitment_posts')
    .whereNotNull('campaign_id')
    .where('status', 'closed')
    .update({ status: 'grouped' });

  // 3. recruitment_applications: 旧值 approved -> confirmed
  await knex('recruitment_applications')
    .where('status', 'approved')
    .update({ status: 'confirmed' });

  await knex.raw(`
    ALTER TABLE recruitment_applications
    MODIFY COLUMN status ENUM('pending', 'invited', 'confirmed', 'waiting', 'rejected')
    NOT NULL DEFAULT 'pending'
  `);

  // 4. 新增字段
  await knex.schema.alterTable('recruitment_applications', (t) => {
    t.timestamp('invited_expires_at').nullable();
    t.integer('waiting_position').nullable();
    t.text('reject_reason').nullable();
  });

  // 5. 新增索引
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

  // 回滚数据：先把新值改回旧值，再收缩枚举
  await knex('recruitment_applications')
    .where('status', 'confirmed')
    .update({ status: 'approved' });

  await knex('recruitment_applications')
    .whereIn('status', ['invited', 'waiting'])
    .update({ status: 'pending' });

  await knex('recruitment_posts')
    .where('status', 'grouped')
    .update({ status: 'closed' });

  await knex('recruitment_posts')
    .where('status', 'draft')
    .update({ status: 'open' });

  await knex('recruitment_posts')
    .whereIn('status', ['dissolved', 'archived'])
    .update({ status: 'closed' });

  await knex.raw(`
    ALTER TABLE recruitment_applications
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'invited', 'confirmed', 'waiting')
    NOT NULL DEFAULT 'pending'
  `);

  await knex.raw(`
    ALTER TABLE recruitment_applications
    MODIFY COLUMN status ENUM('pending', 'approved', 'rejected')
    NOT NULL DEFAULT 'pending'
  `);

  await knex.raw(`
    ALTER TABLE recruitment_posts
    MODIFY COLUMN status ENUM('open', 'closed', 'full')
    NOT NULL DEFAULT 'open'
  `);
}
