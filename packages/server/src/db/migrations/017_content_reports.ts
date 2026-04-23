import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // content_reports 表（举报机制）
  await knex.schema.createTable('content_reports', (t) => {
    t.string('id', 36).primary().notNullable();
    t.string('reporter_user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('content_type', 32).notNullable(); // 'message' | 'post' | 'user'
    t.string('content_id', 64).notNullable();
    t.string('reason', 128).notNullable();
    t.string('status', 16).notNullable().defaultTo('pending'); // pending | reviewed | dismissed
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // gm_private_notes 表（GM 私密笔记）
  await knex.schema.createTable('gm_private_notes', (t) => {
    t.string('id', 36).primary().notNullable();
    t.string('campaign_id', 36).notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
    t.string('gm_user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('content').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // scenes 表新增 visible_history_count 字段（history_visibility 已在 001_init.ts 中存在）
  const hasCount = await knex.schema.hasColumn('scenes', 'visible_history_count');
  if (!hasCount) {
    await knex.schema.alterTable('scenes', (t) => {
      t.integer('visible_history_count').notNullable().defaultTo(50);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('content_reports');
  await knex.schema.dropTableIfExists('gm_private_notes');
  const hasCount = await knex.schema.hasColumn('scenes', 'visible_history_count');
  if (hasCount) {
    await knex.schema.alterTable('scenes', (t) => {
      t.dropColumn('visible_history_count');
    });
  }
}
