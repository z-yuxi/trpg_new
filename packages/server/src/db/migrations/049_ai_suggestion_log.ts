import type { Knex } from 'knex';

/**
 * Migration 049: AI 社交授权开关 + AI 审查建议日志表
 *
 * 变更：
 *   1. users 表新增两个 AI 授权开关字段（默认 false）
 *   2. 新建 ai_suggestion_log 表（记录代码包B的审查建议，供审计/LoRA优化）
 *   3. 新建 user_agent_preferences 表（记录用户"不感兴趣"与免打扰状态）
 */
export async function up(knex: Knex): Promise<void> {
  // 1. users 表追加 AI 社交授权开关
  await knex.schema.alterTable('users', (t) => {
    t.boolean('allow_ai_social').notNullable().defaultTo(false)
      .comment('允许 AI 读取社区社交内容（帖子/评论/组队需求）');
    t.boolean('allow_ai_creative').notNullable().defaultTo(false)
      .comment('允许 AI 读取原创创作内容（模组/跑团记录/原创文稿）');
  });

  // 2. AI 审查建议日志表
  await knex.schema.createTable('ai_suggestion_log', (t) => {
    t.string('id', 64).primary();
    t.string('report_id', 64).notNullable();
    t.string('agent_id', 64).notNullable();
    t.string('action', 64).notNullable();
    t.integer('confidence').notNullable();
    t.text('evidence').nullable();
    t.text('rule').nullable();
    t.text('decision_trace').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['report_id'], 'idx_ai_suggestion_report');
  });

  // 3. 用户 Agent 偏好表（不感兴趣 / 免打扰）
  await knex.schema.createTable('user_agent_preferences', (t) => {
    t.string('id', 64).primary();
    t.string('user_id', 64).notNullable();
    // 永久拒绝某对匹配（rejected_match_pair_id 格式：小uid_大uid）
    t.string('rejected_match_pair_id', 128).nullable();
    // 免打扰截止时间（null 表示无免打扰）
    t.timestamp('snooze_until').nullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id'], 'idx_uap_user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_agent_preferences');
  await knex.schema.dropTableIfExists('ai_suggestion_log');
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('allow_ai_social');
    t.dropColumn('allow_ai_creative');
  });
}
