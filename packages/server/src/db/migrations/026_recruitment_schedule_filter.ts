import type { Knex } from 'knex';

/**
 * 迁移 026：招募帖结构化时间筛选字段
 *
 * 新增字段：
 *   recruitment_posts.schedule_weekday  — JSON 数组，记录适合游戏的星期
 *     枚举值：'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
 *     示例：["sat","sun"] 表示周末场
 *
 *   recruitment_posts.schedule_time_slot — VARCHAR，时间段枚举
 *     枚举值：'morning'（上午）| 'afternoon'（下午）| 'evening'（晚上）| 'night'（深夜）
 *
 * 这两个字段与原有 schedule_text（自由文本）并列；
 * schedule_text 保留用于用户友好的文字展示，结构化字段仅用于筛选。
 *
 * 剩余席位筛选（≥1 / ≥2 / 不限）为纯查询级计算，不需要新字段。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('recruitment_posts', (t) => {
    // 结构化星期（JSON 数组）
    t.json('schedule_weekday').nullable();
    // 结构化时间段
    t.string('schedule_time_slot', 16).nullable();
    // 为时间段筛选加索引（低基数枚举，小表索引价值有限，但保留以备规模增长）
    t.index(['schedule_time_slot'], 'idx_rp_time_slot');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('recruitment_posts', (t) => {
    t.dropIndex([], 'idx_rp_time_slot');
    t.dropColumn('schedule_time_slot');
    t.dropColumn('schedule_weekday');
  });
}
