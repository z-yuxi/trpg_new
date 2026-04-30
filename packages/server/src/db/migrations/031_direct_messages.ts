import type { Knex } from 'knex';

/**
 * 迁移 031：私信系统
 *
 * 三张表：
 * - direct_conversations : 会话（两用户唯一对）
 * - direct_messages      : 消息
 * - direct_reads         : 每用户每会话的最后已读时间（用于计算未读数）
 */
export async function up(knex: Knex): Promise<void> {
  // 会话表
  await knex.schema.createTable('direct_conversations', (t) => {
    t.string('id', 64).primary();
    // 保证 user_a_id < user_b_id，唯一约束确保两人间只存在一条会话
    t.string('user_a_id', 64).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('user_b_id', 64).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('last_message').nullable();
    t.timestamp('last_message_at').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['user_a_id', 'user_b_id']);
    t.index(['user_a_id']);
    t.index(['user_b_id']);
  });

  // 消息表
  await knex.schema.createTable('direct_messages', (t) => {
    t.bigIncrements('id');
    t.string('conversation_id', 64).notNullable()
      .references('id').inTable('direct_conversations').onDelete('CASCADE');
    t.string('sender_id', 64).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('content').notNullable();
    t.string('message_type', 16).notNullable().defaultTo('text'); // text | image
    t.text('image_url').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['conversation_id', 'created_at']);
  });

  // 已读追踪表
  await knex.schema.createTable('direct_reads', (t) => {
    t.string('conversation_id', 64).notNullable()
      .references('id').inTable('direct_conversations').onDelete('CASCADE');
    t.string('user_id', 64).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('last_read_at').defaultTo(knex.fn.now());
    t.primary(['conversation_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('direct_reads');
  await knex.schema.dropTableIfExists('direct_messages');
  await knex.schema.dropTableIfExists('direct_conversations');
}
