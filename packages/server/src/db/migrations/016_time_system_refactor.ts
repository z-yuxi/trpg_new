/**
 * 016_time_system_refactor.ts
 *
 * 时间系统重构迁移：
 * 1. chat_messages.message_type ENUM 新增 'time_tag'
 * 2. scheduled_moves.execute_at_story 改为可空（GM批准时直接立即执行，不再依赖时间触发）
 * 3. position_history.story_time_entered 改为可空（允许无故事时间的移动）
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. chat_messages: 修改 message_type ENUM，加入 time_tag
  await knex.schema.alterTable('chat_messages', (t) => {
    t.enu(
      'message_type',
      ['narrative', 'dice', 'ooc', 'system', 'announcement', 'clue_card', 'time_tag'],
      { useNative: true, enumName: 'chat_message_type' }
    ).alter();
  });

  // 2. scheduled_moves: execute_at_story 改为 nullable
  await knex.schema.alterTable('scheduled_moves', (t) => {
    t.json('execute_at_story').nullable().alter();
  });

  // 3. position_history: story_time_entered 改为 nullable
  await knex.schema.alterTable('position_history', (t) => {
    t.json('story_time_entered').nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  // 回滚：恢复 not nullable（数据需预先清理 null 值）
  await knex.schema.alterTable('position_history', (t) => {
    t.json('story_time_entered').notNullable().alter();
  });

  await knex.schema.alterTable('scheduled_moves', (t) => {
    t.json('execute_at_story').notNullable().alter();
  });

  // chat_messages ENUM 回滚（移除 time_tag）
  await knex.schema.alterTable('chat_messages', (t) => {
    t.enu(
      'message_type',
      ['narrative', 'dice', 'ooc', 'system', 'announcement', 'clue_card'],
      { useNative: true, enumName: 'chat_message_type' }
    ).alter();
  });
}
